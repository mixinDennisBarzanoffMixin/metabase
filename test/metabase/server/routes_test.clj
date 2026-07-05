(ns metabase.server.routes-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(deftest test-public-routes
  (binding [client/*url-prefix* ""]
    (is (str/ends-with? (-> (client/client-full-response :get 302 "public/question/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.csv" {})
                            :headers
                            (get "Location"))
                        "/api/public/card/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/query/csv?"))
    (is (str/ends-with? (-> (client/client-full-response :get 302 "public/question/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json" {})
                            :headers
                            (get "Location"))
                        "/api/public/card/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/query/json?"))
    (is (str/ends-with? (-> (client/client-full-response :get 302 "public/question/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.xlsx" {})
                            :headers
                            (get "Location"))
                        "/api/public/card/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/query/xlsx?"))))

(deftest test-embed-routes
  (binding [client/*url-prefix* ""]
    (is (str/ends-with? (-> (client/client-full-response :get 302 "embed/question/token-string.csv" {})
                            :headers
                            (get "Location"))
                        "/api/embed/card/token-string/query/csv?"))))

(deftest api-readyz-test
  (binding [client/*url-prefix* ""]
    (let [res (client/client :get 200 "api/readyz")]
      (is (=? {:service "metabase"
               :ok      true
               :checks  [{:name   "initialization"
                          :ok     true
                          :detail "complete"}
                         {:name   "database"
                          :ok     true
                          :detail "app-db reachable"}]}
              res))
      (is (every? #(integer? (:latencyMs %)) (:checks res)))))
  (testing "does not require a Veritly project scope"
    (binding [client/*url-prefix* ""]
      (mt/with-current-user nil
        (is (= true (:ok (client/client :get 200 "api/readyz"))))))))
