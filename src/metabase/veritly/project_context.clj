(ns metabase.veritly.project-context
  "Project context for Veritly-owned Metabase routes."
  (:import
   (java.net URLDecoder)))

(set! *warn-on-reflection* true)

(def ^:dynamic *project-id* nil)

(def ^:private id-pattern
  #"^[A-Za-z0-9._-]+$")

(defn- decode
  [raw]
  (URLDecoder/decode (str raw) "UTF-8"))

(defn- normalize
  [raw]
  (let [id (decode raw)]
    (when-not (and (seq id)
                   (<= (count id) 254)
                   (re-matches id-pattern id))
      (throw (ex-info "Invalid Veritly project id."
                      {:status-code 400
                       :project-id raw})))
    id))

(defn current-project-id
  []
  *project-id*)

(defn require-project-id
  []
  (or *project-id*
      (throw (ex-info "Metabase route requires a Veritly project id."
                      {:status-code 400}))))

(defn wrap-project
  [handler raw]
  (let [id (normalize raw)]
    (fn [request respond raise]
      (binding [*project-id* id]
        (handler (assoc request :veritly-project-id id) respond raise)))))
