(ns metabase.veritly.files-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.veritly.files :as files]
   [metabase.veritly.project-context :as context]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest add-onlyoffice-chart-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Veritly chart test"}
                 :model/Dashboard  {dashboard-id :id}  {:name          "Distribution"
                                                        :collection_id collection-id}]
    (t2/insert! :veritly_project {:project_id "chart-test" :root_collection_id collection-id})
    (try
      (mt/with-current-user (mt/user->id :crowberto)
        (binding [context/*project-id* "chart-test"]
          (let [chart  {:provider   "onlyoffice"
                        :fileId     "file-1"
                        :fileName   "Distribution.xlsx"
                        :sourceId   "sheet-1"
                        :sourceName "Sheet1"
                        :chartId    "chart-1"
                        :revision  2
                        :name      "Sales"}
                result (files/add-chart! dashboard-id chart)
                card   (t2/select-one :model/DashboardCard :dashboard_id dashboard-id)]
            (is (= "veritlyChart" (:kind result)))
            (is (= chart (get-in card [:visualization_settings :veritlyChart])))
            (is (= "veritlyChart" (get-in card [:visualization_settings :virtual_card :display])))
            (is (= [12 6] [(:size_x card) (:size_y card)])))))
      (finally
        (t2/delete! :veritly_project :project_id "chart-test")))))
