(ns metabase.veritly.projects
  "Project-scoped Metabase content helpers."
  (:require
   [clojure.string :as str]
   [metabase.veritly.project-context :as context]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- root-name
  [project-id]
  (str "Veritly project " project-id))

(defn- create-root!
  [project-id]
  (let [root (t2/insert-returning-instance! :model/Collection
                                            {:name     (root-name project-id)
                                             :location "/"})]
    (t2/insert! :veritly_project
                {:project_id         project-id
                 :root_collection_id (:id root)})
    (:id root)))

(defn root-collection-id!
  []
  (let [project-id (context/require-project-id)]
    (or (t2/select-one-fn :root_collection_id :veritly_project :project_id project-id)
        (t2/with-transaction [_]
          (or (t2/select-one-fn :root_collection_id :veritly_project :project_id project-id)
              (create-root! project-id))))))

(defn project-bound?
  []
  (boolean (context/current-project-id)))

(defn owned-collection-id?
  [collection-id]
  (let [root-id (root-collection-id!)]
    (or (= collection-id root-id)
        (when collection-id
          (when-let [location (t2/select-one-fn :location :model/Collection :id collection-id)]
            (boolean (re-find (re-pattern (str "^/" root-id "(/|$)")) location)))))))

(defn ensure-collection!
  [collection-id]
  (if collection-id
    (do
      (when-not (owned-collection-id? collection-id)
        (throw (ex-info "Metabase collection is outside the current Veritly project."
                        {:status-code   403
                         :collection-id collection-id})))
      collection-id)
    (root-collection-id!)))

(defn dashboard-in-project?
  [dashboard-id]
  (when (context/current-project-id)
    (owned-collection-id? (t2/select-one-fn :collection_id :model/Dashboard :id dashboard-id))))

(defn check-dashboard!
  [dashboard-id]
  (when-not (dashboard-in-project? dashboard-id)
    (throw (ex-info "Metabase dashboard is outside the current Veritly project."
                    {:status-code  404
                     :dashboard-id dashboard-id}))))

(defn card-in-project?
  [card-id]
  (when (context/current-project-id)
    (owned-collection-id? (t2/select-one-fn :collection_id :model/Card :id card-id))))

(defn database-in-project?
  [database-id]
  (when-let [project-id (context/current-project-id)]
    (t2/exists? :veritly_project_database
                :project_id project-id
                :database_id database-id)))

(defn table-in-project?
  [table-id]
  (when-let [project-id (context/current-project-id)]
    (t2/exists? :model/Table
                {:where [:and
                         [:= :id table-id]
                         [:in :db_id {:select [:database_id]
                                      :from   [:veritly_project_database]
                                      :where  [:= :project_id project-id]}]]})))

(defn bind-database!
  [database-id]
  (let [project-id (context/require-project-id)]
    (root-collection-id!)
    (when-not (database-in-project? database-id)
      (t2/insert! :veritly_project_database
                  {:project_id  project-id
                   :database_id database-id}))))

(defn database-filter-clause
  [column]
  (let [project-id (context/require-project-id)]
    [:in column {:select [:database_id]
                 :from   [:veritly_project_database]
                 :where  [:= :project_id project-id]}]))

(defn table-filter-clause
  [column]
  (let [project-id (context/require-project-id)]
    [:in column {:select [:id]
                 :from   [:metabase_table]
                 :where  [:in :db_id {:select [:database_id]
                                       :from   [:veritly_project_database]
                                       :where  [:= :project_id project-id]}]}]))

(defn collection-filter-clause
  [id-column location-column]
  (let [root-id (root-collection-id!)]
    [:or
     [:= id-column root-id]
     [:like location-column (str "/" root-id "/%")]]))

(defn- collection-ids
  [root-id]
  (conj (t2/select-fn-set :id :model/Collection
                          {:where [:like :location (str "/" root-id "/%")]})
        root-id))

(defn- clean-name
  [name fallback]
  (let [value (str/trim (str (or name "")))]
    (str/replace (if (seq value) value fallback) #"[\\/]+" "-")))

(defn- file-row
  [kind id name ext]
  (let [title (clean-name name (str kind " " id))
        path  (str title ext)]
    {:kind kind
     :id   (str id)
     :name title
     :path path}))

(defn files
  []
  (let [project-id (context/require-project-id)
        ids        (collection-ids (root-collection-id!))
        dash       (t2/select :model/Dashboard
                              {:where [:and
                                       [:= :archived false]
                                       [:in :collection_id ids]]})
        dash-ids   (set (map :id dash))
        card-ids   (when (seq dash-ids)
                     (t2/select-fn-set :card_id :model/DashboardCard
                                       {:where [:and
                                                [:in :dashboard_id dash-ids]
                                                [:not= :card_id nil]]}))
        card-where (if (seq card-ids)
                     [:and
                      [:= :archived false]
                      [:or
                       [:in :collection_id ids]
                       [:in :id card-ids]]]
                     [:and
                      [:= :archived false]
                      [:in :collection_id ids]])
        cards      (t2/select :model/Card {:where card-where})
        dashboards (for [dashboard dash]
                     (assoc (file-row "dashboard" (:id dashboard) (:name dashboard) ".dash")
                            :dashboardId (str (:id dashboard))))
        cards      (for [card cards]
                     (assoc (file-row "question" (:id card) (:name card) ".question")
                            :cardId (str (:id card))))
        databases  (for [row (t2/select :veritly_project_database :project_id project-id)
                         :let [database (t2/select-one :model/Database :id (:database_id row))]
                         :when database]
                     (assoc (file-row "source" (:id database) (:name database) ".source")
                            :databaseId (str (:id database))))]
    {:files (vec (concat databases cards dashboards))}))
