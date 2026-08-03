(ns metabase.veritly.workos-session
  "Direct WorkOS sealed-session support for Veritly-hosted Metabase."
  (:require
   [cheshire.core :as cheshire]
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.request.current :as current]
   [metabase.request.util :as request.util]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [ring.util.response :as response])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest SecureRandom)
   (java.util Base64)
   (javax.crypto Cipher Mac SecretKeyFactory)
   (javax.crypto.spec IvParameterSpec PBEKeySpec SecretKeySpec)))

(set! *warn-on-reflection* true)

(def ^:private cookie "wos-session")
(def ^:private prefix "Fe26.2")
(def ^:private suffix "~2")
(def ^:private workos "https://api.workos.com")
(def ^:private rng (SecureRandom.))

(defn session-cookie
  [request]
  (get-in request [:cookies cookie :value]))

(defn- env
  [k]
  (let [v (some-> (System/getenv k) str/trim)]
    (when-not (seq v)
      (throw (ex-info (str k " is missing") {:env k})))
    v))

(defn- secret
  []
  (let [v (env "COOKIE_PASSWORD")]
    (when (< (count v) 32)
      (throw (ex-info "COOKIE_PASSWORD must be at least 32 characters" {})))
    v))

(defn- bytes
  ^bytes [^String s]
  (.getBytes s StandardCharsets/UTF_8))

(defn- text
  ^String [^bytes b]
  (String. b StandardCharsets/UTF_8))

(defn- random
  ^bytes [size]
  (let [b (byte-array size)]
    (.nextBytes rng b)
    b))

(defn- hex
  [^bytes b]
  (apply str (map #(format "%02x" (bit-and % 0xff)) b)))

(defn- b64
  ^String [^bytes b]
  (.encodeToString (.withoutPadding (Base64/getUrlEncoder)) b))

(defn- unb64
  ^bytes [^String s]
  (let [pad (case (mod (count s) 4)
              0 s
              2 (str s "==")
              3 (str s "=")
              (throw (ex-info "Invalid base64url length" {})))]
    (.decode (Base64/getUrlDecoder) pad)))

(defn- derive
  [secret salt bits alg]
  (let [spec (PBEKeySpec. (.toCharArray ^String secret) (bytes salt) 1 bits)]
    (SecretKeySpec. (.getEncoded (.generateSecret (SecretKeyFactory/getInstance "PBKDF2WithHmacSHA1") spec)) alg)))

(defn- hmac
  ^bytes [secret salt body]
  (let [mac (Mac/getInstance "HmacSHA256")]
    (.init mac (derive secret salt 256 "HmacSHA256"))
    (.doFinal mac (bytes body))))

(defn- aes
  ^bytes [mode secret salt iv body]
  (let [cipher (Cipher/getInstance "AES/CBC/PKCS5Padding")]
    (.init cipher mode (derive secret salt 256 "AES") (IvParameterSpec. iv))
    (.doFinal cipher body)))

(defn- compact
  [m]
  (into {} (filter (comp some? val) m)))

(defn- parts
  [sealed]
  (let [[raw version] (str/split sealed #"~" 2)]
    {:raw raw
     :version version
     :parts (vec (.split ^String raw "\\*" -1))}))

(defn- unseal*
  [sealed secret]
  (let [{version :version items :parts} (parts sealed)]
    (when-not (or (nil? version) (= version "2"))
      (throw (ex-info "Unsupported WorkOS session seal version" {:version version})))
    (when-not (= 8 (count items))
      (throw (ex-info "Incorrect number of sealed components" {})))
    (let [[p id salt iv enc exp mac-salt digest] items]
      (when-not (= prefix p)
        (throw (ex-info "Wrong mac prefix" {})))
      (when-not (= "1" id)
        (throw (ex-info "Cannot find password" {:id id})))
      (when (seq exp)
        (when-not (re-matches #"[1-9]\d*" exp)
          (throw (ex-info "Invalid expiration" {})))
        (when (<= (Long/parseLong exp) (- (System/currentTimeMillis) 60000))
          (throw (ex-info "Expired seal" {}))))
      (let [base (str/join "*" [p id salt iv enc exp])]
        (when-not (MessageDigest/isEqual (unb64 digest) (hmac secret mac-salt base))
          (throw (ex-info "Bad hmac value" {})))
        (json/decode+kw (text (aes Cipher/DECRYPT_MODE secret salt (unb64 iv) (unb64 enc))))))))

(defn- unseal
  [sealed secret]
  (try
    (when-let [data (unseal* sealed secret)]
      (if (= "2" (:version (parts sealed)))
        data
        (if (contains? data :persistent)
          (:persistent data)
          data)))
    (catch Exception e
      (log/debugf e "Ignoring invalid WorkOS sealed session")
      nil)))

(defn- seal
  [data secret]
  (let [salt (hex (random 32))
        iv (random 16)
        enc (b64 (aes Cipher/ENCRYPT_MODE secret salt iv (bytes (cheshire/generate-string data))))
        base (str/join "*" [prefix "1" salt (b64 iv) enc ""])
        mac-salt (hex (random 32))]
    (str base "*" mac-salt "*" (b64 (hmac secret mac-salt base)) suffix)))

(defn- jwt-part
  [token n]
  (nth (str/split token #"\.") n))

(defn- jwt-json
  [token n]
  (json/decode+kw (text (unb64 (jwt-part token n)))))

(defn- fresh?
  [token]
  ;; The encrypted seal has already authenticated this token with COOKIE_PASSWORD. Checking the embedded expiry is
  ;; sufficient here and avoids turning every cold browser request into a blocking WorkOS JWKS request.
  (try
    (let [exp (:exp (jwt-json token 1))]
      (and (number? exp)
           (> (long exp) (+ (quot (System/currentTimeMillis) 1000) 30))))
    (catch Exception e
      (log/debugf e "WorkOS access token payload is invalid")
      false)))

(defn- body
  [cfg data request]
  (compact
   {:grant_type "refresh_token"
    :client_id (:client cfg)
    :client_secret (:key cfg)
    :refresh_token (:refreshToken data)
    :organization_id (:organizationId data)
    :ip_address (current/ip-address request)
    :user_agent (get-in request [:headers "user-agent"])}))

(defn- user
  [raw]
  {:object (:object raw)
   :id (:id raw)
   :email (:email raw)
   :emailVerified (:email_verified raw)
   :profilePictureUrl (:profile_picture_url raw)
   :name (:name raw)
   :firstName (:first_name raw)
   :lastName (:last_name raw)
   :lastSignInAt (:last_sign_in_at raw)
   :locale (:locale raw)
   :createdAt (:created_at raw)
   :updatedAt (:updated_at raw)
   :externalId (:external_id raw)
   :metadata (if (some? (:metadata raw)) (:metadata raw) {})})

(defn- refreshed
  [cfg data request]
  (when (and (:refreshToken data) (:user data) (:accessToken data))
    (let [res (http/post (str workos "/user_management/authenticate")
                         {:accept :json
                          :as :json
                          :body (json/encode (body cfg data request))
                          :conn-timeout 5000
                          :content-type :json
                          :headers {"Authorization" (str "Bearer " (:key cfg))}
                          :socket-timeout 5000
                          :throw-exceptions false})]
      (when (= 200 (:status res))
        (let [data (compact {:accessToken (:access_token (:body res))
                             :authenticationMethod (:authentication_method (:body res))
                             :impersonator (:impersonator (:body res))
                             :organizationId (:organization_id (:body res))
                             :refreshToken (:refresh_token (:body res))
                             :user (user (:user (:body res)))})]
          (assoc data :sealed (seal data (:secret cfg))))))))

(defn authenticate
  [request]
  (when-let [sealed (session-cookie request)]
    (let [secret (secret)
          data (unseal sealed secret)]
      (when (:accessToken data)
        (if (fresh? (:accessToken data))
          data
          (refreshed {:client (env "WORKOS_CLIENT_ID")
                      :key (env "WORKOS_API_KEY")
                      :secret secret}
                     data
                     request))))))

(defn- host
  [request]
  (some-> (or (get-in request [:headers "x-forwarded-host"])
              (get-in request [:headers "host"]))
          (str/split #":")
          first
          str/lower-case))

(defn- attrs
  [request]
  (compact
   {:path "/"
    :http-only true
    :secure (request.util/https? request)
    :same-site :lax
    :max-age (* 60 60 24 7)
    :domain (when-let [h (host request)]
              (cond
                (or (= h "veritly.co.uk") (str/ends-with? h ".veritly.co.uk")) ".veritly.co.uk"
                (str/ends-with? h ".svc.cluster.local") (str "." (str/join "." (take-last 4 (str/split h #"\."))))))}))

(defn set-session-cookie
  [request res sealed]
  (response/set-cookie res cookie sealed (attrs request)))

(defn clear-session-cookie
  [request res]
  (response/set-cookie res cookie nil (assoc (attrs request)
                                             :expires "Thu, 1 Jan 1970 00:00:00 GMT"
                                             :max-age 0)))
