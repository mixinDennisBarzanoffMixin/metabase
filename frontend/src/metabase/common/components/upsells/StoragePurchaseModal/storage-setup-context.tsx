import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";

import { usePurchaseStorageAddOn } from "./use-purchase-storage-add-on";

type StorageSetupContextValue = ReturnType<typeof usePurchaseStorageAddOn>;

const StorageSetupContext = createContext<StorageSetupContextValue | null>(
  null,
);

/**
 * Holds the storage purchase + setup state so it is shared across the panels
 * that host the upsell and survives the Add data modal being closed and
 * reopened. It must be mounted *outside* the modal's `Modal.Root` so that the
 * polling in `usePurchaseStorageAddOn` keeps running while the modal is closed.
 */
export const StorageSetupProvider = ({ children }: { children: ReactNode }) => {
  const { isSettingUp, isReady, handlePurchase, reset } =
    usePurchaseStorageAddOn();

  // Once storage is ready the panels reveal their default view on their own
  // (they gate on `hasStorage`/`uploadsEnabled`), so collapse the transient
  // setting-up state back to `initial` to avoid getting stuck mid-flow.
  useEffect(() => {
    if (isSettingUp && isReady) {
      reset();
    }
  }, [isSettingUp, isReady, reset]);

  const value = useMemo(
    () => ({ isSettingUp, isReady, handlePurchase, reset }),
    [isSettingUp, isReady, handlePurchase, reset],
  );

  return (
    <StorageSetupContext.Provider value={value}>
      {children}
    </StorageSetupContext.Provider>
  );
};

export const useStorageSetup = (): StorageSetupContextValue => {
  const context = useContext(StorageSetupContext);

  if (!context) {
    throw new Error(
      "useStorageSetup must be used within a StorageSetupProvider",
    );
  }

  return context;
};
