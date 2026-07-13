(ns metabase.server.routes
  "Main Compojure routes tables. See https://github.com/weavejester/compojure/wiki/Routes-In-Detail for details about
   how these work. `/api/` routes are in [[metabase.api-routes.routes]]."
  (:require
   [clojure.string :as str]
   [compojure.core :as compojure :refer #_{:clj-kondo/ignore [:discouraged-var]} [context defroutes GET OPTIONS POST]]
   [compojure.route :as route]
   [metabase.api.macros :as api.macros]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.appearance.core :as appearance]
   [metabase.initialization-status.core :as init-status]
   [metabase.oauth-server.api :as oauth-server.api]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.server.auth-wrapper :as auth-wrapper]
   [metabase.server.middleware.embedding-sdk-bundle :as mw.embedding-sdk-bundle]
   [metabase.server.routes.index :as index]
   [metabase.server.routes.static :as static]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.veritly.files :as veritly.files]
   [metabase.veritly.project-context :as project]
   [metabase.veritly.projects :as veritly.projects]
   [ring.util.response :as response]))

(defn- redirect-including-query-string
  "Like `response/redirect`, but passes along query string URL params as well. This is important because the public and
   embedding routes below pass query params (such as template tags) as part of the URL."
  [url]
  (fn [{:keys [query-string]} respond _raise]
    (respond (response/redirect (str url "?" query-string)))))

;; /public routes. /public/question/:uuid.:export-format redirects to /api/public/card/:uuid/query/:export-format
#_{:clj-kondo/ignore [:discouraged-var]}
(defroutes ^:private ^{:arglists '([request respond raise])} public-routes
  (GET ["/question/:uuid.:export-format", :uuid u/uuid-regex, :export-format qp.schema/export-formats-regex]
    [uuid export-format]
    (redirect-including-query-string (format "%s/api/public/card/%s/query/%s" (system/site-url) uuid export-format)))
  (GET "*" [] index/public))

;; /embed routes.
;; /embed/sdk/v1 -> new iframe embedding based on embedding sdk components
;; /embed/question/:token.:export-format redirects to /api/public/card/:token/query/:export-format
#_{:clj-kondo/ignore [:discouraged-var]}
(defroutes ^:private ^{:arglists '([request respond raise])} embed-routes
  (GET "/sdk/v1" [] index/embed-sdk)
  (GET ["/question/:token.:export-format", :export-format qp.schema/export-formats-regex]
    [token export-format]
    (redirect-including-query-string (format "%s/api/embed/card/%s/query/%s" (system/site-url) token export-format)))
  (GET "*" [] index/embed))

(defn- health-handler
  ([]
   (if (init-status/complete?)
     (try
       (if (or (mdb/recent-activity?)
               (mdb/can-connect-to-data-source? (mdb/data-source)))
         {:status 200, :body {:status "ok"}}
         {:status 503 :body {:status "Unable to get app-db connection"}})
       (catch Exception e
         (log/warn e "Error in api/health database check")
         {:status 503 :body {:status "Error getting app-db connection"}}))
     {:status 503, :body {:status "initializing", :progress (init-status/progress)}}))

  ([_request respond _raise]
   (respond (health-handler))))

(defn- elapsed
  [start]
  (long (/ (- (System/nanoTime) start) 1000000)))

(defn- init-check
  []
  (let [start (System/nanoTime)
        ok    (init-status/complete?)]
    (cond-> {:name      "initialization"
             :ok        ok
             :detail    (if ok "complete" "initializing")
             :latencyMs (elapsed start)}
      (not ok) (assoc :progress (init-status/progress)))))

(defn- app-db-check
  []
  (let [start (System/nanoTime)]
    (try
      (if-not (init-status/complete?)
        {:name      "database"
         :ok        false
         :detail    "skipped until initialization completes"
         :latencyMs (elapsed start)}
        (if (or (mdb/recent-activity?)
                (mdb/can-connect-to-data-source? (mdb/data-source)))
          {:name      "database"
           :ok        true
           :detail    "app-db reachable"
           :latencyMs (elapsed start)}
          {:name      "database"
           :ok        false
           :detail    "unable to get app-db connection"
           :latencyMs (elapsed start)}))
      (catch Exception e
        (log/warn e "Error in api/readyz database check")
        {:name      "database"
         :ok        false
         :detail    "error getting app-db connection"
         :latencyMs (elapsed start)}))))

(defn- readyz-handler
  ([]
   (let [checks [(init-check) (app-db-check)]
         ok     (every? :ok checks)]
     {:status (if ok 200 503)
      :body   {:service "metabase"
               :ok      ok
               :checks  checks}}))
  ([_request respond _raise]
   (respond (readyz-handler))))

(defn- livez-handler
  "Simple liveness probe that does not perform any database checks. Always returns 200 with the
  same body format as `/api/health` when healthy."
  ([] {:status 200, :body {:status "ok"}})
  ([_request respond _raise]
   (respond (livez-handler))))

#_{:clj-kondo/ignore [:discouraged-var]}
(defroutes ^:private static-files-handler
  (GET "/embedding-sdk.js" request
    ((mw.embedding-sdk-bundle/serve-bundle-handler) request))
  ;; All SDK chunks live in embedding-sdk/chunks/ — filenames contain content
  ;; hashes, so we serve them with far-future immutable cache headers.
  (GET ["/embedding-sdk/chunks/:filename" :filename #"[^/]+\.js"] [filename :as request]
    ((mw.embedding-sdk-bundle/serve-chunk-handler filename) request))
  ;; fall back to serving _all_ other files under /app, preferring
  ;; pre-compressed (.br, .gz) variants when the browser supports them
  (static/precompressed-resources "/" {:root "frontend_client/app"})
  (route/not-found {:status 404 :body "Not found."}))

(mu/defn- api-handler :- ::api.macros/handler
  [api-routes :- ::api.macros/handler]
  (fn api-handler* [request respond raise]
    ;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
    ;;
    ;; if Metabase is not finished initializing, return a generic error message rather than
    ;; something potentially confusing like "DB is not set up"
    (if-not (init-status/complete?)
      (respond {:status 503, :body "Metabase is still initializing. Please sit tight..."})
      (api-routes request respond raise))))

(defn- missing-project-response
  []
  {:status 400
   :body   "Veritly Metabase routes require /project/:project-id."})

(defn- unscoped-api-handler
  [api-routes]
  (let [handler (api-handler api-routes)]
    (fn [request respond raise]
      (if (:veritly-session? request)
        (respond (missing-project-response))
        (handler request respond raise)))))

(defn- unscoped-index
  [request respond raise]
  (if (:veritly-session? request)
    (respond (missing-project-response))
    (index/index request respond raise)))

(defn- project-index
  [project-id]
  (fn [request respond raise]
    (let [root (str "/project/" project-id)]
      (index/index
       (cond-> request
         (str/starts-with? (:uri request) root)
         (assoc :uri (subs (:uri request) (count root))
                :veritly-base-href (str root "/")))
       respond
       raise))))

(mu/defn- project-routes :- ::api.macros/handler
  [api-routes :- ::api.macros/handler
   project-id :- :string]
  (project/wrap-project
   (compojure/routes
    (GET "/favicon.ico" [] (response/resource-response (appearance/application-favicon-url)))
    (OPTIONS "/api/*" [] {:status 200 :body ""})
    (GET "/api/veritly/files" []
      (api/check-403 api/*current-user-id*)
      {:status 200 :body (veritly.projects/files)})
    (POST "/api/veritly/question" request
      (api/check-403 api/*current-user-id*)
      {:status 200 :body (veritly.files/create-question! (get-in request [:body :name]))})
    (POST "/api/veritly/dashboard/:dashboard-id/univer-chart" [dashboard-id :as request]
      (api/check-403 api/*current-user-id*)
      {:status 200
       :body   (veritly.files/add-univer-chart! (Long/parseLong dashboard-id) (:body request))})
    (context "/api" [] (api-handler api-routes))
    (context "/app" [] static-files-handler)
    (GET "*" [] (project-index project-id)))
   project-id))

(mu/defn make-routes :- ::api.macros/handler
  "Create the top-level Ring route handler for Metabase."
  [api-routes :- ::api.macros/handler]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (compojure/routes
   auth-wrapper/routes
   (context "/.well-known" [] oauth-server.api/well-known-routes)
   (context "/oauth" [] oauth-server.api/oauth-routes)
   ;; ^/$ -> index.html
   (GET "/" [] unscoped-index)
   (GET "/favicon.ico" [] (response/resource-response (appearance/application-favicon-url)))
   ;; ^/api/health -> Health Check Endpoint
   (GET "/api/health" [] health-handler)
   ;; ^/api/readyz -> Veritly readiness probe with detailed internal checks
   (GET "/api/readyz" [] readyz-handler)
   ;; ^/readyz -> Veritly readiness probe with detailed internal checks
   (GET "/readyz" [] readyz-handler)
   ;; ^/livez -> Liveness probe (no DB access)
   (GET "/livez" [] livez-handler)
   ;; Handle CORS preflight requests for auth routes
   (OPTIONS "/auth/*" [] {:status 200 :body ""})
   (OPTIONS "/api/*" [] {:status 200 :body ""})
   (context "/project/:project-id" [project-id] (project-routes api-routes project-id))
   ;; ^/api/ -> All other API routes
   (context "/api" [] (unscoped-api-handler api-routes))
   ;; ^/app/ -> static files under frontend_client/app
   (context "/app" [] static-files-handler)
   ;; ^/public/ -> Public frontend and download routes
   (context "/public" [] public-routes)
   ;; ^/emebed/ -> Embed frontend and download routes
   (context "/embed" [] embed-routes)
   ;; Anything else (e.g. /user/edit_current) should serve up index.html; React app will handle the rest
   (GET "*" [] unscoped-index)))

;;; TODO -- if anything changes here we should rebuild these routes? We need a version
;;; of [[metabase.server.handler/dev-handler]] for these routes
