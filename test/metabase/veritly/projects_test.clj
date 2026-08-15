(ns metabase.veritly.projects-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.veritly.project-context :as context]
   [metabase.veritly.projects :as projects]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest managed-binding-and-file-metadata-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Managed source test"}
                 :model/Database   {database-id :id}   {:name "Project Data"}]
    (t2/insert! :veritly_project {:project_id "managed-test" :root_collection_id collection-id})
    (try
      (binding [context/*project-id* "managed-test"]
        (projects/bind-database! database-id
                                 {:source-kind "managed" :file-path "Project Data.source"})
        (is (projects/managed-database? database-id))
        (is (= {:kind       "source"
                :id         (str database-id)
                :name       "Project Data"
                :path       "Project Data.source"
                :databaseId (str database-id)
                :sourceKind "managed"
                :filePath   "Project Data.source"
                :managed    true}
               (-> (projects/files) :files first)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"can only be changed by the data service"
                              (projects/ensure-unmanaged! database-id)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"data service must remove the managed source"
                              (projects/cleanup!))))
      (finally
        (t2/delete! :veritly_project :project_id "managed-test")))))

(deftest external-binding-defaults-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "External source test"}
                 :model/Database   {database-id :id}   {:name "Warehouse"}]
    (t2/insert! :veritly_project {:project_id "external-test" :root_collection_id collection-id})
    (try
      (binding [context/*project-id* "external-test"]
        (projects/bind-database! database-id)
        (is (false? (projects/managed-database? database-id)))
        (is (= {:sourceKind "external" :filePath nil :managed false}
               (select-keys (-> (projects/files) :files first)
                            [:sourceKind :filePath :managed]))))
      (finally
        (t2/delete! :veritly_project :project_id "external-test")))))
