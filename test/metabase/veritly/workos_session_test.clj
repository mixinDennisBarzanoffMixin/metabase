(ns metabase.veritly.workos-session-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.util.json :as json]
   [metabase.veritly.workos-session :as workos])
  (:import
   (java.nio.charset StandardCharsets)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(defn- b64
  [value]
  (.encodeToString (.withoutPadding (Base64/getUrlEncoder))
                   (.getBytes ^String (json/encode value) StandardCharsets/UTF_8)))

(defn- token
  [exp]
  (str (b64 {:alg "RS256"}) "." (b64 {:exp exp}) ".signature"))

(deftest sealed-session-authentication-test
  (testing "a fresh sealed session never blocks on WorkOS or JWKS"
    (let [pass "test-cookie-password-at-least-thirty-two-characters"
          data {:accessToken (token (+ (quot (System/currentTimeMillis) 1000) 300))
                :refreshToken "refresh"
                :user {:id "user_1"}}
          sealed (#'workos/seal data pass)]
      (with-redefs-fn {#'workos/secret (constantly pass)
                       #'http/post (fn [& _]
                                     (throw (ex-info "WorkOS must not be called for a fresh session" {})))}
        #(is (= data
                (workos/authenticate {:cookies {"wos-session" {:value sealed}}})))))))
