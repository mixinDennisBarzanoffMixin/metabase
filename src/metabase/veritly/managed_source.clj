(ns metabase.veritly.managed-source
  "Service-owned lifecycle for the managed PostgreSQL source in a Veritly project."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.app-db.cluster-lock :as lock]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.util :as u]
   [metabase.veritly.projects :as projects]
   [metabase.warehouses.core :as warehouses]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(def ^:private name-schema
  [:and [:string {:min 1 :max 254}] [:fn #(seq (str/trim %))]])

(def ^:private text-schema
  [:and [:string {:min 1 :max 128}] [:fn #(seq (str/trim %))]])

(def ^:private target-schema
  [:map {:closed true}
   [:schema text-schema]
   [:table text-schema]
   [:column text-schema]])

(def ^:private column-schema
  [:map {:closed true}
   [:name text-schema]
   [:displayName text-schema]
   [:target {:optional true} target-schema]])

(def ^:private table-schema
  [:map {:closed true}
   [:schema text-schema]
   [:table text-schema]
   [:displayName text-schema]
   [:columns [:vector column-schema]]
   [:keys [:vector text-schema]]])

(def ^:private input-schema
  [:map {:closed true}
   [:name name-schema]
   [:filePath [:and [:string {:min 1 :max 512}] [:fn #(seq (str/trim %))]]]
   [:details :map]
   [:tables [:vector table-schema]]])

(defn- token
  []
  (let [value (System/getenv "VERITLY_CONTROL_TOKEN")]
    (when value (not-empty (str/trim value)))))

(defn- encoded
  [value]
  (.getBytes ^String value StandardCharsets/UTF_8))

(defn- equal?
  [left right]
  (and left right
       (MessageDigest/isEqual (encoded left) (encoded right))))

(defn authorized?
  "Return true when the request carries the configured constant-time service token."
  [request]
  (let [expected (token)
        header   (get-in request [:headers "authorization"])
        supplied (when (and (string? header) (str/starts-with? header "Bearer "))
                   (subs header 7))]
    (boolean (equal? expected supplied))))

(defn check-token!
  "Reject an unavailable or invalid Veritly control token."
  [request]
  (when-not (token)
    (throw (ex-info "VERITLY_CONTROL_TOKEN is not configured."
                    {:status-code 503})))
  (when-not (authorized? request)
    (throw (ex-info "Invalid Veritly service token."
                    {:status-code 401}))))

(defn- validate!
  [schema value message]
  (when-not (mc/validate schema value)
    (throw (ex-info message {:status-code 400})))
  value)

(defn- input
  [body]
  (let [value   (validate! input-schema body "Managed source payload is invalid.")
        name    (:name value)
        path    (:filePath value)
        details (:details body)
        tables  (:tables body)]
    (when-not (str/ends-with? path ".source")
      (throw (ex-info "filePath must end in .source."
                      {:status-code 400 :field :filePath})))
    {:name name :path path :details details :tables tables}))

(def ^:private system-fields
  #{"_veritly_id" "_veritly_version" "_veritly_updated_at"})

(defn- table-input
  [value]
  (let [table (validate! table-schema value "Managed table payload is invalid.")]
    {:schema (:schema table)
     :table (:table table)
     :display (:displayName table)
     :columns (:columns table)
     :keys (set (:keys table))}))

(defn- field-input
  [table value]
  (let [column (validate! column-schema value "Managed column payload is invalid.")
        name   (:name column)
        target (:target column)]
    {:name name
     :display (:displayName column)
     :primary (contains? (:keys table) name)
     :target (when target
               {:schema (:schema target)
                :table  (:table target)
                :column (:column target)})}))

(defn- table-record
  [database {:keys [schema table]}]
  (if-let [record (t2/select-one :model/Table :db_id (:id database) :schema schema :name table :active true)]
    record
    (throw (ex-info "Managed PostgreSQL table was not discovered."
                    {:status-code 409 :schema schema :table table}))))

(defn- field-record
  [table name]
  (if-let [field (t2/select-one :model/Field :table_id (:id table) :name name :active true)]
    field
    (throw (ex-info "Managed PostgreSQL column was not discovered."
                    {:status-code 409 :table (:name table) :column name}))))

(defn sync!
  "Synchronously discover declared managed tables and apply their stable metadata."
  [database values]
  (sync-metadata/sync-db-metadata-explicit! database)
  (t2/update! :model/Table {:db_id (:id database) :schema "_veritly"}
              {:visibility_type "hidden"})
  (let [tables (mapv table-input values)
        rows   (mapv (fn [table]
                       (let [record (table-record database table)]
                         (t2/update! :model/Table (:id record) {:display_name (:display table)})
                         (doseq [name system-fields
                                 :let [field (t2/select-one :model/Field :table_id (:id record) :name name :active true)]
                                 :when field]
                           (t2/update! :model/Field (:id field)
                                       (cond-> {:visibility_type "hidden"}
                                         (= name "_veritly_id") (assoc :semantic_type :type/PK))))
                         (doseq [value (:columns table)
                                 :let [input (field-input table value)
                                       field (field-record record (:name input))]]
                           (t2/update! :model/Field (:id field)
                                       (cond-> {:display_name (:display input)}
                                         (:primary input) (assoc :semantic_type :type/PK))))
                         {:input table :record record}))
                     tables)]
    (doseq [{:keys [input record]} rows
            value (:columns input)
            :let [column (field-input input value)]
            :when (:target column)]
      (let [target-table (table-record database {:schema (get-in column [:target :schema])
                                                 :table (get-in column [:target :table])})
            target-field (field-record target-table (get-in column [:target :column]))
            field (field-record record (:name column))]
        (t2/update! :model/Field (:id field)
                    {:semantic_type :type/FK :fk_target_field_id (:id target-field)})))
    {:tables (mapv (fn [{:keys [input record]}]
                     {:id (str (:id record)) :schema (:schema input) :table (:table input)})
                   rows)}))

(defn- save!
  [{:keys [name path details]}]
  (lock/with-cluster-lock ::source
    (projects/root-collection-id!)
    (if-let [binding (projects/managed-binding)]
      (let [database (t2/select-one :model/Database :id (:database_id binding))]
        (when-not database
          (throw (ex-info "Managed source binding has no database."
                          {:status-code 409
                           :database-id (:database_id binding)})))
        (t2/update! :model/Database (:id database)
                    {:name                name
                     :engine              :postgres
                     :details             details
                     :is_full_sync        false
                     :is_on_demand        true
                     :auto_run_queries    true
                     :settings            (assoc (:settings database) :connection-pool-size 3)
                     :provider_name       "veritly"})
        (projects/bind-database! (:id database)
                                 {:source-kind "managed" :file-path path})
        (let [updated (t2/select-one :model/Database :id (:id database))]
          (events/publish-event! :event/database-update
                                 {:object updated
                                  :user-id config/internal-mb-user-id
                                  :previous-object database
                                  :details-changed? (not= (:details database) details)})
          updated))
      (let [database (t2/insert-returning-instance!
                      :model/Database
                      {:name                name
                       :engine              :postgres
                       :details             details
                       :is_full_sync        false
                       :is_on_demand        true
                       :auto_run_queries    true
                       :settings            {:connection-pool-size 3}
                       :provider_name       "veritly"
                       :creator_id          config/internal-mb-user-id
                       :initial_sync_status "complete"})]
        (projects/bind-database! (:id database)
                                 {:source-kind "managed" :file-path path})
        (events/publish-event! :event/database-create
                               {:object database :user-id config/internal-mb-user-id})
        database))))

(defn upsert!
  "Create or update the current project's managed PostgreSQL source and declared table metadata."
  [body]
  (let [{:keys [details tables] :as data} (input body)
        checked (warehouses/test-connection-details :postgres details)]
    (when (= false (:valid checked))
      (throw (ex-info "Managed PostgreSQL connection failed."
                      {:status-code 422
                       :error (dissoc checked :valid)})))
    (let [database (save! (assoc data :details checked))
          synced   (if (empty? tables) {:tables []} (sync! database tables))]
      {:databaseId (str (u/the-id database))
       :name (:name database)
       :path (:path data)
       :sourceKind "managed"
       :tables (:tables synced)})))

(defn remove!
  "Remove the current project's managed source binding and warehouse record idempotently."
  []
  (lock/with-cluster-lock ::source
    (when-let [binding (projects/managed-binding)]
      (let [database (t2/select-one :model/Database :id (:database_id binding))]
        (t2/delete! :veritly_project_database
                    :project_id (:project_id binding)
                    :database_id (:database_id binding))
        (when database
          (t2/delete! :model/Database :id (:id database))
          (events/publish-event! :event/database-delete
                                 {:object database :user-id config/internal-mb-user-id})))))
  {:ok true})

(defn cleanup!
  "Remove the managed source and every Metabase resource owned by the current project."
  []
  (remove!)
  (projects/cleanup!))
