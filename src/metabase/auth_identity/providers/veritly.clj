(ns metabase.auth-identity.providers.veritly
  "Veritly WorkOS provider for direct Metabase login."
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.auth-identity.provider :as provider]
   [metabase.events.core :as events]
   [metabase.setup.core :as setup]
   [metabase.system.core :as system]
   [metabase.util :as u]
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

(defn- fields
  []
  [:model/User :id :email :first_name :last_name :sso_source :is_active :last_login :tenant_id])

(defn- first-user-row!
  [provider data id]
  (t2/with-transaction [_]
    (let [user (t2/insert-returning-instance! (fields)
                                              (assoc (select-keys data [:email :first_name :last_name])
                                                     :is_superuser true))]
      (t2/delete! :model/AuthIdentity :user_id (:id user) :provider "password")
      (t2/insert! :model/AuthIdentity {:user_id (:id user)
                                       :provider (name provider)
                                       :provider_id id})
      (t2/update! :model/User (:id user) {:sso_source :veritly})
      (appearance/site-name! "Veritly Metabase")
      (system/admin-email! (:email data))
      (setup/clear-token!)
      (events/publish-event! :event/user-joined {:user-id (:id user)})
      user)))

(defn- first-user!
  [provider request]
  (let [data (:user-data request)]
    (assoc request
           :success? true
           :redirect-url "/"
           :user (first-user-row! provider data (:provider-id request)))))

(defn- user-by-email
  [email]
  (t2/select-one (fields) :%lower.email (u/lower-case-en email)))

(defn- create-user!
  [provider data id]
  (t2/with-transaction [_]
    (let [user (t2/insert-returning-instance! (fields)
                                              (select-keys data [:email :first_name :last_name :sso_source]))]
      (t2/insert! :model/AuthIdentity {:user_id (:id user)
                                       :provider (name provider)
                                       :provider_id id})
      (events/publish-event! :event/user-joined {:user-id (:id user)})
      user)))

(defn- identity!
  [provider user id]
  (if-let [ident (t2/select-one [:model/AuthIdentity :id :provider_id]
                                :user_id (:id user)
                                :provider (name provider))]
    (when-not (= (:provider_id ident) id)
      (t2/update! :model/AuthIdentity (:id ident) {:provider_id id}))
    (t2/insert! :model/AuthIdentity {:user_id (:id user)
                                     :provider (name provider)
                                     :provider_id id})))

(defn- changed?
  [user data]
  (not= (select-keys user [:email :first_name :last_name :sso_source])
        (select-keys data [:email :first_name :last_name :sso_source])))

(defn- sync-user!
  [provider user data id]
  (t2/with-transaction [_]
    (when (changed? user data)
      (t2/update! :model/User (:id user) (select-keys data [:email :first_name :last_name :sso_source])))
    (identity! provider user id)
    (t2/select-one (fields) :id (:id user))))

(defn resolve-user!
  "Resolve a verified WorkOS session to a Metabase user without creating a Metabase session."
  [workos]
  (let [provider :provider/veritly
        result (provider/authenticate provider {:workos workos})]
    (when (:success? result)
      (let [data (:user-data result)
            id (:provider-id result)
            user (or (when-let [user-id (:user-id result)]
                       (t2/select-one (fields) :id user-id))
                     (user-by-email (:email data)))]
        (cond
          user
          (sync-user! provider user data id)

          (setup/has-user-setup)
          (create-user! provider data id)

          :else
          (first-user-row! provider data id))))))

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
