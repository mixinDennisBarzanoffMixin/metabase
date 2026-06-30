(ns metabase.auth-identity.providers.veritly
  "Veritly WorkOS provider for direct Metabase login."
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.auth-identity.provider :as provider]
   [metabase.events.core :as events]
   [metabase.setup.core :as setup]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(derive :provider/veritly ::provider/provider)
(derive :provider/veritly ::provider/create-user-if-not-exists)

(defn- field
  [m a b]
  (if (contains? m a)
    (get m a)
    (get m b)))

(defn- data
  [user]
  (let [email (:email user)]
    (when-not (seq email)
      (throw (ex-info "WorkOS user is missing email" {})))
    {:email email
     :first_name (field user :firstName :first_name)
     :last_name (field user :lastName :last_name)
     :sso_source :veritly}))

(defn- first-user!
  [provider request]
  (let [data (:user-data request)]
    (t2/with-transaction [_]
      (let [user (t2/insert-returning-instance! [:model/User :id :is_active :last_login :tenant_id]
                                                (assoc (select-keys data [:email :first_name :last_name])
                                                       :is_superuser true))]
        (t2/delete! :model/AuthIdentity :user_id (:id user) :provider "password")
        (t2/insert! :model/AuthIdentity {:user_id (:id user)
                                         :provider (name provider)
                                         :provider_id (:provider-id request)})
        (t2/update! :model/User (:id user) {:sso_source :veritly})
        (appearance/site-name! "Veritly Metabase")
        (system/admin-email! (:email data))
        (setup/clear-token!)
        (events/publish-event! :event/user-joined {:user-id (:id user)})
        (assoc request
               :success? true
               :redirect-url "/"
               :user (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id (:id user)))))))

(methodical/defmethod provider/authenticate :provider/veritly
  [_provider {:keys [workos] :as _request}]
  (try
    (if-let [user (:user workos)]
      (let [id (:id user)]
        (when-not (seq id)
          (throw (ex-info "WorkOS user is missing id" {})))
        (let [ident (t2/select-one [:model/AuthIdentity :user_id]
                                   :provider "veritly"
                                   :provider_id id)]
          (cond-> {:success? true
                   :user-data (data user)
                   :provider-id id}
            (:user_id ident) (assoc :user-id (:user_id ident)))))
      {:success? false
       :error :invalid-session
       :message "Invalid Veritly session"})
    (catch Exception e
      (log/warn e "Veritly authentication failed")
      {:success? false
       :error :server-error
       :message "Veritly authentication failed"})))

(methodical/defmethod provider/login! :provider/veritly
  [provider request]
  (cond
    (= :redirect (:success? request))
    request

    (not (:success? request))
    request

    (or (:user request) (setup/has-user-setup))
    (next-method provider request)

    :else
    (first-user! provider request)))
