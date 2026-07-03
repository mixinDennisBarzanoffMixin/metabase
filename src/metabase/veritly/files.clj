(ns metabase.veritly.files
  "Project-scoped Metabase file actions."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.queries.core :as queries]
   [metabase.veritly.project-context :as context]
   [metabase.veritly.projects :as projects]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table
  []
  (let [project-id (context/require-project-id)]
    (t2/select-one [:model/Table :id :db_id]
                   {:where    [:and
                               [:= :active true]
                               [:in :db_id {:select [:database_id]
                                            :from   [:veritly_project_database]
                                            :where  [:= :project_id project-id]}]]
                    :order-by [[:db_id :asc] [:schema :asc] [:name :asc] [:id :asc]]})))

(defn create-question!
  [name]
  (let [title (str/trim (str (or name "")))
        table (or (table)
                  (throw (ex-info "No synced table exists for this Veritly project."
                                  {:status-code 409})))
        card  (queries/create-card!
               {:name                   (if (seq title) title "Question")
                :display                "table"
                :visualization_settings {}
                :collection_id          (projects/root-collection-id!)
                :dataset_query          {:database (:db_id table)
                                         :type     :query
                                         :query    {:source-table (:id table)}}}
               @api/*current-user*)]
    {:kind   "question"
     :id     (str (:id card))
     :name   (:name card)
     :path   (str (:name card) ".question")
     :cardId (str (:id card))}))
