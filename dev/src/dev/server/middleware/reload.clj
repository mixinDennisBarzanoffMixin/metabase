(ns dev.server.middleware.reload
  "Watcher-backed development reload middleware.

  Ring's reload middleware scans every source file before every request. That is
  too expensive for this repo in local k8s, where health checks keep the server
  busy even when nobody is using Metabase."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.log :as log]
   [ring.middleware.reload :as reload])
  (:import
   (java.io File)
   (java.nio.file ClosedWatchServiceException FileSystems Files Path StandardWatchEventKinds WatchKey WatchService)
   (java.util.concurrent TimeUnit)))

(def ^:private exts #{".clj" ".cljc" ".cljs"})
(def ^:private skip #{"/readyz" "/api/readyz" "/livez" "/api/health"})
(defonce ^:private dirty (atom true))
(defonce ^:private watcher (atom nil))

(defn- source?
  [path]
  (some #(str/ends-with? path %) exts))

(defn- dir?
  [^Path path]
  (Files/isDirectory path (make-array java.nio.file.LinkOption 0)))

(defn- dirs
  [roots]
  (->> roots
       (map io/file)
       (filter #(.exists ^File %))
       (filter #(.isDirectory ^File %))))

(defn- register!
  [^WatchService watcher ^File dir keys]
  (let [path (.toPath dir)
        key  (.register path watcher
                        (into-array java.nio.file.WatchEvent$Kind
                                    [StandardWatchEventKinds/ENTRY_CREATE
                                     StandardWatchEventKinds/ENTRY_MODIFY
                                     StandardWatchEventKinds/ENTRY_DELETE]))]
    (swap! keys assoc key path)))

(defn- register-all!
  [watcher root keys]
  (doseq [file (file-seq root)
          :when (.isDirectory ^File file)]
    (register! watcher file keys)))

(defn- event-path
  [keys ^WatchKey key event]
  (str (.resolve ^Path (get @keys key) ^Path (.context event))))

(defn- watch!
  [roots]
  (let [watcher (.newWatchService (FileSystems/getDefault))
        keys    (atom {})]
    (doseq [root (dirs roots)]
      (register-all! watcher root keys))
    (future
      (try
        (loop []
          (if-let [key (.poll watcher 1 TimeUnit/SECONDS)]
            (do
            (doseq [event (.pollEvents key)
                    :let  [path (event-path keys key event)]]
              (when (and (= (.kind event) StandardWatchEventKinds/ENTRY_CREATE)
                         (dir? (.toPath (io/file path))))
                (register-all! watcher (io/file path) keys))
              (when (source? path)
                (reset! dirty true)))
              (when (.reset key)
                (recur)))
            (recur)))
        (catch ClosedWatchServiceException _)
        (catch Throwable e
          (log/warn e "Dev reload file watcher stopped"))))
    watcher))

(defn- ensure-watcher!
  [roots]
  (when-not @watcher
    (reset! watcher (watch! roots))))

(defn wrap-reload
  [handler opts]
  (let [lock    (Object.)
        reload! (#'reload/reloader (:dirs opts ["src"])
                                   (:reload-compile-errors? opts true))]
    (ensure-watcher! (:dirs opts ["src"]))
    (log/info "Watcher-backed dev reload enabled")
    (fn
      ([request]
       (when-not (skip (:uri request))
         (locking lock
           (when @dirty
             (reset! dirty false)
             (reload!))))
       (handler request))
      ([request respond raise]
       (when-not (skip (:uri request))
         (locking lock
           (when @dirty
             (reset! dirty false)
             (reload!))))
       (handler request respond raise)))))
