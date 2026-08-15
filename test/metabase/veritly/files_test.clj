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

(deftest create-question-requires-table-for-multiple-tables-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Veritly question test"}
                 :model/Database   {database-id :id}   {}
                 :model/Table      {first-id :id}      {:db_id database-id :name "first" :active true}
                 :model/Table      {second-id :id}     {:db_id database-id :name "second" :active true}]
    (t2/insert! :veritly_project {:project_id "question-test" :root_collection_id collection-id})
    (t2/insert! :veritly_project_database
                {:project_id "question-test" :database_id database-id :source_kind "external"})
    (try
      (mt/with-current-user (mt/user->id :crowberto)
        (binding [context/*project-id* "question-test"]
          (testing "an omitted table is ambiguous"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"tableId is required"
                                  (files/create-question! "Ambiguous" nil))))
          (testing "an explicit project table is used"
              (let [result (files/create-question! "Second table" second-id)
                  card   (t2/select-one :model/Card :id (parse-long (:id result)))]
              (is (= second-id (:table_id card)))))
          (testing "a table outside the project is rejected"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"outside the current Veritly project"
                                  (files/create-question! "Outside" (+ first-id second-id 1000)))))))
      (finally
        (t2/delete! :veritly_project :project_id "question-test")))))

(deftest create-question-selects-the-only-table-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Veritly one-table test"}
                 :model/Database   {database-id :id}   {}
                 :model/Table      {table-id :id}      {:db_id database-id :active true}]
    (t2/insert! :veritly_project {:project_id "one-table-test" :root_collection_id collection-id})
    (t2/insert! :veritly_project_database
                {:project_id "one-table-test" :database_id database-id :source_kind "external"})
    (try
      (mt/with-current-user (mt/user->id :crowberto)
        (binding [context/*project-id* "one-table-test"]
          (let [result (files/create-question! "Only table" nil)
                card   (t2/select-one :model/Card :id (parse-long (:id result)))]
            (is (= table-id (:table_id card))))))
      (finally
        (t2/delete! :veritly_project :project_id "one-table-test")))))
