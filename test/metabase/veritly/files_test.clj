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

(deftest add-univer-chart-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Veritly chart test"}
                 :model/Dashboard  {dashboard-id :id}  {:name          "Distribution"
                                                        :collection_id collection-id}]
    (t2/insert! :veritly_project {:project_id "chart-test" :root_collection_id collection-id})
    (try
      (mt/with-current-user (mt/user->id :crowberto)
        (binding [context/*project-id* "chart-test"]
          (let [chart  {:unitId    "unit-1"
                        :unitName  "Distribution.xlsx"
                        :sheetId   "sheet-1"
                        :sheetName "Sheet1"
                        :id        "chart-1"
                        :chartType 4
                        :revision  2}
                ref    {:unitId    "unit-1"
                        :unitName  "Distribution.xlsx"
                        :sheetId   "sheet-1"
                        :sheetName "Sheet1"
                        :chartId   "chart-1"
                        :revision  2
                        :name      "Distribution.xlsx / Sheet1 / Chart 4"}
                result (files/add-univer-chart! dashboard-id chart)
                card   (t2/select-one :model/DashboardCard :dashboard_id dashboard-id)]
            (is (= "univerChart" (:kind result)))
            (is (= ref (get-in card [:visualization_settings :univerChart])))
            (is (= "univerChart" (get-in card [:visualization_settings :virtual_card :display])))
            (is (= [6 5] [(:size_x card) (:size_y card)])))))
      (finally
        (t2/delete! :veritly_project :project_id "chart-test")))))
