(ns metabase.veritly.managed-source-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.veritly.managed-source :as source]
   [metabase.veritly.project-context :as context]
   [metabase.veritly.projects :as projects]
   [metabase.warehouses.core :as warehouses]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest service-token-test
  (with-redefs-fn {#'source/token (constantly "service-secret")}
    #(do
       (is (source/authorized? {:headers {"authorization" "Bearer service-secret"}}))
       (is (false? (source/authorized? {:headers {"authorization" "Bearer wrong"}})))
       (is (false? (source/authorized? {:headers {}})))
       (is (nil? (source/check-token!
                  {:headers {"authorization" "Bearer service-secret"}})))
       (is (thrown-with-msg? clojure.lang.ExceptionInfo
                             #"Invalid Veritly service token"
                             (source/check-token! {:headers {"authorization" "Bearer wrong"}}))))))

(deftest managed-source-input-test
  (testing "a stable virtual source path is required"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"filePath must end in .source"
                          (source/upsert! {:name "Project Data"
                                           :filePath "Project Data"
                                           :details {}
                                           :tables []}))))
  (testing "connection details are required"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Managed source payload is invalid"
                          (source/upsert! {:name "Project Data"
                                           :filePath "Project Data.source"
                                           :tables []})))))

(deftest managed-source-upsert-is-idempotent-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Managed source upsert test"}]
    (t2/insert! :veritly_project {:project_id "managed-upsert-test" :root_collection_id collection-id})
    (try
      (binding [context/*project-id* "managed-upsert-test"]
        (mt/with-dynamic-fn-redefs [warehouses/test-connection-details (fn [_ details] details)]
          (let [first  (source/upsert! {:name "Project Data"
                                        :filePath "Project Data.source"
                                        :details {:host "data" :port 5432 :dbname "first"}
                                        :tables []})
                _      (t2/update! :model/Database
                                   (parse-long (:databaseId first))
                                   {:settings {:connection-pool-size 3}})
                second (source/upsert! {:name "Project Data"
                                        :filePath "Project Data.source"
                                        :details {:host "data" :port 5432 :dbname "second"}
                                        :tables []})]
            (is (= (:databaseId first) (:databaseId second)))
            (is (= 1 (t2/count :veritly_project_database
                               :project_id "managed-upsert-test"
                               :source_kind "managed")))
            (let [id (parse-long (:databaseId first))]
              (is (= "veritly" (t2/select-one-fn :provider_name :model/Database :id id)))
              (is (not (contains? (t2/select-one-fn :settings :model/Database :id id)
                                  :connection-pool-size)))))
          (is (= {:ok true} (source/remove!)))
          (is (zero? (t2/count :veritly_project_database
                               :project_id "managed-upsert-test")))))
      (finally
        (t2/delete! :veritly_project :project_id "managed-upsert-test")))))

(deftest managed-source-precise-metadata-test
  (mt/with-temp [:model/Database database {:name "Managed metadata"}
                 :model/Table    table    {:db_id (:id database) :schema "sales" :name "orders" :active true}
                 :model/Table    target   {:db_id (:id database) :schema "sales" :name "customers" :active true}
                 :model/Table    internal {:db_id (:id database) :schema "_veritly" :name "changes" :active true}
                 :model/Field    row-id   {:table_id (:id table) :name "_veritly_id" :active true}
                 :model/Field    amount   {:table_id (:id table) :name "amount" :active true}
                 :model/Field    customer {:table_id (:id table) :name "customer_id" :active true}
                 :model/Field    target-id {:table_id (:id target) :name "id" :active true}]
    (with-redefs [sync-metadata/sync-db-metadata-explicit! (constantly nil)]
      (is (= {:tables [{:id (str (:id table)) :schema "sales" :table "orders"}]}
             (source/sync! database
                           [{:schema "sales"
                             :table "orders"
                             :displayName "Orders"
                             :keys ["amount"]
                             :columns [{:name "amount" :displayName "Revenue"}
                                       {:name "customer_id"
                                        :displayName "Customer ID"
                                        :target {:schema "sales" :table "customers" :column "id"}}]}])))
      (is (= "Orders" (t2/select-one-fn :display_name :model/Table :id (:id table))))
      (is (= :hidden (t2/select-one-fn :visibility_type :model/Table :id (:id internal))))
      (is (= {:visibility_type :hidden :semantic_type :type/PK}
             (select-keys (t2/select-one :model/Field :id (:id row-id))
                          [:visibility_type :semantic_type])))
      (is (= {:display_name "Revenue" :semantic_type :type/PK}
             (select-keys (t2/select-one :model/Field :id (:id amount))
                          [:display_name :semantic_type])))
      (is (= {:semantic_type :type/FK :fk_target_field_id (:id target-id)}
             (select-keys (t2/select-one :model/Field :id (:id customer))
                          [:semantic_type :fk_target_field_id]))))))

(deftest managed-source-project-cleanup-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Managed cleanup test"}
                 :model/Database   {database-id :id}   {:name "Managed cleanup database"}]
    (t2/insert! :veritly_project {:project_id "managed-cleanup-test" :root_collection_id collection-id})
    (binding [context/*project-id* "managed-cleanup-test"]
      (projects/bind-database! database-id
                               {:source-kind "managed" :file-path "Project Data.source"})
      (is (= {:ok true} (source/cleanup!)))
      (is (false? (t2/exists? :veritly_project :project_id "managed-cleanup-test")))
      (is (false? (t2/exists? :model/Database :id database-id))))))
