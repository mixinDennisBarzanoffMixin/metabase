(ns metabase.driver.sql-jdbc.connection.veritly-tunnel
  "A local TCP entrance backed by authenticated, outbound WebSocket streams through a Veritly connector."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.util.log :as log])
  (:import
   (java.net InetAddress ServerSocket Socket URI URLEncoder)
   (java.net.http HttpClient HttpRequest HttpRequest$BodyPublishers HttpResponse$BodyHandlers WebSocket WebSocket$Listener)
   (java.nio ByteBuffer)
   (java.time Duration)
   (java.util.concurrent CompletableFuture CompletionStage ExecutorService Executors TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private ^HttpClient client
  (-> (HttpClient/newBuilder)
      (.connectTimeout (Duration/ofSeconds 5))
      (.build)))

(defn enabled? [details]
  (true? (:veritly-tunnel-enabled details)))

(defn open? [details]
  (when-let [tracker (:veritly-tunnel-tracker details)]
    (not (.isClosed ^ServerSocket (:server tracker)))))

(defn- done ^CompletionStage []
  (CompletableFuture/completedFuture nil))

(defn- close-socket! [^Socket socket]
  (when-not (.isClosed socket)
    (.close socket)))

(defn- uri [details]
  (let [gateway (:veritly-gateway details)
        route   (URLEncoder/encode ^String (:veritly-route details) "UTF-8")]
    (URI/create (str gateway (if (.contains ^String gateway "?") "&" "?") "route=" route))))

(defn- env [key]
  (let [value (some-> (System/getenv key) str/trim)]
    (when (str/blank? value)
      (throw (ex-info (str key " is required for Veritly connector routes") {:key key})))
    value))

(defn- bind! [details]
  (let [base    (str/replace (env "VERITLY_CONTROL_URL") #"/+$" "")
        payload (json/generate-string {:route (:veritly-route details)
                                       :token (:veritly-token details)
                                       :host  (:host details)
                                       :port  (:port details)})
        request (-> (HttpRequest/newBuilder (URI/create (str base "/connector/internal/route")))
                    (.header "Authorization" (str "Bearer " (env "VERITLY_CONTROL_TOKEN")))
                    (.header "Content-Type" "application/json")
                    (.timeout (Duration/ofSeconds 5))
                    (.POST (HttpRequest$BodyPublishers/ofString payload))
                    (.build))
        response (.send client request (HttpResponse$BodyHandlers/ofString))]
    (when-not (= 200 (.statusCode response))
      (throw (ex-info "Veritly connector route could not be bound"
                      {:status (.statusCode response)})))))

(defn- bridge! [tracker details ^Socket socket]
  (let [output (.getOutputStream socket)
        ws     (-> (.newWebSocketBuilder client)
                   (.header "Authorization" (str "Bearer " (:veritly-token details)))
                   (.buildAsync
                    (uri details)
                    (proxy [WebSocket$Listener] []
                      (onOpen [^WebSocket websocket]
                        (.request websocket 1))
                      (onBinary [^WebSocket websocket ^ByteBuffer data _last]
                        (let [bytes (byte-array (.remaining data))]
                          (.get data bytes)
                          (.write output bytes)
                          (.flush output)
                          (.request websocket 1)
                          (done)))
                      (onClose [_websocket _status _reason]
                        (close-socket! socket)
                        (done))
                      (onError [_websocket error]
                        (log/warn error "Veritly tunnel stream failed")
                        (close-socket! socket))))
                   (.orTimeout 10 TimeUnit/SECONDS)
                   (.join))]
    (swap! (:clients tracker) conj socket)
    (try
      (with-open [input (.getInputStream socket)]
        (let [buffer (byte-array 65536)]
          (loop []
            (let [size (.read input buffer)]
              (when (pos? size)
                (-> (.sendBinary ^WebSocket ws (ByteBuffer/wrap buffer 0 size) true) .join)
                (recur))))))
      (finally
        (swap! (:clients tracker) disj socket)
        (when-not (.isOutputClosed ^WebSocket ws)
          (-> (.sendClose ^WebSocket ws WebSocket/NORMAL_CLOSURE "closed") .join))
        (close-socket! socket)))))

(defn- accept! [tracker details]
  (while (not (.isClosed ^ServerSocket (:server tracker)))
    (try
      (let [socket (.accept ^ServerSocket (:server tracker))]
        (.submit ^ExecutorService (:executor tracker)
                 ^Runnable (fn []
                             (try
                               (bridge! tracker details socket)
                               (catch Throwable error
                                 (log/warn error "Veritly tunnel stream failed")
                                 (close-socket! socket))))))
      (catch java.net.SocketException error
        (when-not (.isClosed ^ServerSocket (:server tracker))
          (log/warn error "Veritly tunnel listener failed"))))))

(defn include! [details]
  {:pre [(string? (:veritly-route details))
         (string? (:veritly-token details))
         (string? (:veritly-gateway details))]}
  (if (and (enabled? details) (open? details))
    details
    (do
      (bind! details)
      (let [server   (ServerSocket. 0 128 (InetAddress/getLoopbackAddress))
            executor (Executors/newCachedThreadPool)
            tracker  {:server server :executor executor :clients (atom #{})}
            port     (.getLocalPort server)
            next     (assoc details
                            :host "localhost"
                            :orig-port (:port details)
                            :port port
                            :veritly-tunnel-tracker tracker)]
        (.submit ^ExecutorService executor ^Runnable (fn [] (accept! tracker details)))
        (log/tracef "Opened Veritly connector route %s on local port %d" (:veritly-route details) port)
        next))))

(defn close! [details]
  (when-let [tracker (:veritly-tunnel-tracker details)]
    (.close ^ServerSocket (:server tracker))
    (doseq [socket @(:clients tracker)]
      (close-socket! socket))
    (.shutdownNow ^ExecutorService (:executor tracker))
    (.awaitTermination ^ExecutorService (:executor tracker) 2 TimeUnit/SECONDS)))
