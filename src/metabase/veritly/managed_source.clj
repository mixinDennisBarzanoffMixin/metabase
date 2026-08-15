(ns metabase.veritly.managed-source
  "Service-owned lifecycle for the managed PostgreSQL source in a Veritly project."
  (:require
   [clojure.string :as str]
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

(defn- token
  []
  (some-> (System/getenv "VERITLY_CONTROL_TOKEN") str/trim not-empty))

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

(defn- required-text
  [body key limit]
  (let [value (get body key)]
    (when-not (and (string? value)
                   (seq (str/trim value))
                   (<= (count value) limit))
      (throw (ex-info (str (name key) " is required.")
                      {:status-code 400 :field key})))
    value))

(defn- input
  [body]
  (let [name    (required-text body :name 254)
        path    (required-text body :filePath 512)
        details (:details body)
        tables  (:tables body)]
    (when-not (str/ends-with? path ".source")
      (throw (ex-info "filePath must end in .source."
                      {:status-code 400 :field :filePath})))
    (when-not (map? details)
      (throw (ex-info "details is required."
                      {:status-code 400 :field :details})))
    (when-not (or (nil? tables) (vector? tables))
      (throw (ex-info "tables must be an array."
                      {:status-code 400 :field :tables})))
    {:name name :path path :details details :tables tables}))

(def ^:private system-fields
  #{"_veritly_id" "_veritly_version" "_veritly_updated_at"})

(defn- table-input
  [value]
  (when-not (map? value)
    (throw (ex-info "Each managed table must be an object."
                    {:status-code 400})))
  (let [schema  (required-text value :schema 128)
        table   (required-text value :table 128)
        display (or (:displayName value) table)
        columns (or (:columns value) [])
        keys    (set (or (:keys value) []))]
    (when-not (and (string? display) (seq (str/trim display)))
      (throw (ex-info "Managed table displayName must be text."
                      {:status-code 400})))
    (when-not (and (vector? columns) (every? map? columns))
      (throw (ex-info "Managed table columns must be an array of objects."
                      {:status-code 400})))
    {:schema schema :table table :display display :columns columns :keys keys}))

(defn- field-input
  [table value]
  (let [name    (required-text value :name 128)
        display (or (:displayName value) name)
        target  (:target value)]
    (when-not (and (string? display) (seq (str/trim display)))
      (throw (ex-info "Managed column displayName must be text."
                      {:status-code 400 :column name})))
    (when-not (or (nil? target) (map? target))
      (throw (ex-info "Managed column target must be an object."
                      {:status-code 400 :column name})))
    {:name name
     :display display
     :primary (contains? (:keys table) name)
     :target (when target
               {:schema (required-text target :schema 128)
                :table  (required-text target :table 128)
                :column (required-text target :column 128)})}))

(defn- table-record
  [database {:keys [schema table]}]
  (or (t2/select-one :model/Table :db_id (:id database) :schema schema :name table :active true)
      (throw (ex-info "Managed PostgreSQL table was not discovered."
                      {:status-code 409 :schema schema :table table}))))

(defn- field-record
  [table name]
  (or (t2/select-one :model/Field :table_id (:id table) :name name :active true)
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
          synced   (when (seq tables) (sync! database tables))]
      (cond-> {:databaseId (str (u/the-id database))
               :name (:name database)
               :path (:path data)
               :sourceKind "managed"}
        synced (assoc :tables (:tables synced))))))

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
