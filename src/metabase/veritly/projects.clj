(ns metabase.veritly.projects
  "Project-scoped Metabase content helpers."
  (:require
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
