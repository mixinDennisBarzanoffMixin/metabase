(ns metabase.veritly.files
  "Project-scoped Metabase file actions."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.events.core :as events]
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

(defn- required-text
  [chart key]
  (let [value (get chart key)]
    (when-not (and (string? value) (seq value))
      (throw (ex-info (str "Live chart " (name key) " missing.") {:status-code 400})))
    value))

(defn- chart-ref
  [chart]
  (when-not (map? chart)
    (throw (ex-info "Live chart reference missing." {:status-code 400})))
  (let [revision (:revision chart)
        provider (required-text chart :provider)]
    (when-not (number? revision)
      (throw (ex-info "Live chart revision missing." {:status-code 400})))
    (when-not (#{"univer" "onlyoffice"} provider)
      (throw (ex-info "Live chart provider is unsupported." {:status-code 400})))
    (merge
     {:provider   provider
      :fileId     (required-text chart :fileId)
      :fileName   (required-text chart :fileName)
      :chartId    (required-text chart :chartId)
      :sourceId   (required-text chart :sourceId)
      :sourceName (required-text chart :sourceName)
      :revision   revision
      :name       (required-text chart :name)}
     (select-keys chart [:unitId :unitName :sheetId :sheetName]))))

(defn add-chart!
  [dashboard-id chart]
  (projects/check-dashboard! dashboard-id)
  (let [dash     (api/write-check :model/Dashboard dashboard-id)
        placed   (t2/select [:model/DashboardCard :row :col :size_x :size_y :dashboard_tab_id]
                            :dashboard_id dashboard-id)
        position (autoplace/get-position-for-new-dashcard placed 6 5 autoplace/default-grid-width)
        card     {:name                   nil
                  :display                "veritlyChart"
                  :visualization_settings {}
                  :archived               false}
        created  (first (dashboard/add-dashcards!
                         dash
                         [(merge position
                                 {:card_id                nil
                                  :visualization_settings {:virtual_card card
                                                           :veritlyChart (chart-ref chart)}})]))]
    (events/publish-event! :event/dashboard-add-cards
                           {:object dash :user-id api/*current-user-id* :dashcards [created]})
    {:kind        "veritlyChart"
     :dashboardId (str dashboard-id)
     :dashcardId  (str (:id created))
     :chart       (get-in created [:visualization_settings :veritlyChart])}))
