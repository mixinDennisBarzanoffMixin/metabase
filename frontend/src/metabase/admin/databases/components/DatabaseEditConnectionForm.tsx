import type { LocationDescriptorObject } from "history";
import { updateIn } from "icepick";
import { type ComponentType, useRef, useState } from "react";
import { type Route, withRouter } from "react-router";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { GenericError } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useCallbackEffect } from "metabase/common/hooks/use-callback-effect";
import {
  getDbNotModifiableMessage,
  isDbModifiable,
} from "metabase/common/utils/database";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import type {
  DatabaseFormConfig,
  FormLocation,
} from "metabase/databases/types";
import { useDispatch } from "metabase/redux";
import type { Dispatch } from "metabase/redux/store";
import { Text } from "metabase/ui";
import { useVeritlyFlush } from "metabase/veritly/flush";
import type {
  DatabaseData,
  DatabaseEditErrorType,
  DatabaseId,
} from "metabase-types/api";

import { saveDatabase } from "../database";

const makeDefaultSaveDbFn =
  (dispatch: Dispatch) =>
  async (database: DatabaseData): Promise<any> =>
    await dispatch(saveDatabase(database));

export const DatabaseEditConnectionForm = withRouter(
  ({
    database,
    isAttachedDWH,
    initializeError,
    handleSaveDb,
    onSubmitted,
    onCancel,
    onEngineChange,
    route,
    location,
    config,
    formLocation,
    ...props
  }: {
    database?: Partial<DatabaseData>;
    isAttachedDWH: boolean;
    initializeError?: unknown;
    handleSaveDb?: (database: DatabaseData) => Promise<{ id: DatabaseId }>;
    onSubmitted: (savedDB: { id: DatabaseId }) => void;
    onCancel: () => void;
    onEngineChange?: (engineKey: string | undefined) => void;
    route: Route;
    location: LocationDescriptorObject;
    autofocusFieldName?: string;
    config?: Omit<DatabaseFormConfig, "isAdvanced">;
    formLocation: Extract<FormLocation, "admin" | "full-page">;
  }) => {
    const dispatch = useDispatch();

    const [isDirty, setIsDirty] = useState(false);
    const pending = useRef<PromiseWithResolvers<void>>();

    const autofocusFieldName =
      location.hash?.slice(1) || props.autofocusFieldName;

    /**
     * Navigation is scheduled so that LeaveConfirmationModal's isEnabled
     * prop has a chance to re-compute on re-render
     */
    const [isCallbackScheduled, scheduleCallback] = useCallbackEffect();

    const handleSubmit = async (database: DatabaseData) => {
      try {
        const saveFn = handleSaveDb ?? makeDefaultSaveDbFn(dispatch);
        const savedDB = await saveFn(database);
        scheduleCallback(() => {
          onSubmitted(savedDB);
          pending.current?.resolve();
          pending.current = undefined;
        });
      } catch (error) {
        const result = getSubmitError(error as DatabaseEditErrorType);
        pending.current?.reject(
          result instanceof Error
            ? result
            : new Error("Metabase could not save the database connection"),
        );
        pending.current = undefined;
        throw result;
      }
    };

    useVeritlyFlush("source", async () => {
      if (!isDirty) {
        return;
      }
      const form = document.querySelector('[data-testid="database-form"]');
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("Metabase database form is unavailable");
      }
      if (pending.current) {
        throw new Error("Metabase database form is already saving");
      }
      const wait = Promise.withResolvers<void>();
      pending.current = wait;
      form.requestSubmit();
      const late = Promise.withResolvers<never>();
      const timer = setTimeout(
        () => late.reject(new Error("Metabase database form did not save")),
        4_500,
      );
      try {
        await Promise.race([wait.promise, late.promise]);
      } finally {
        clearTimeout(timer);
        if (pending.current === wait) {
          pending.current = undefined;
        }
      }
    });

    return (
      <ErrorBoundary errorComponent={GenericError as ComponentType}>
        <LoadingAndErrorWrapper
          loading={!database}
          error={initializeError}
          noWrapper
        >
          {isDbModifiable({
            id: database?.id,
            is_attached_dwh: isAttachedDWH,
            is_sample: database?.is_sample,
          }) ? (
            <DatabaseForm
              initialValues={database}
              autofocusFieldName={autofocusFieldName}
              config={{ isAdvanced: true, ...config }}
              onCancel={onCancel}
              onSubmit={handleSubmit}
              onDirtyStateChange={setIsDirty}
              location={formLocation}
              onEngineChange={onEngineChange}
            />
          ) : (
            <Text my="md">{getDbNotModifiableMessage(database)}</Text>
          )}
        </LoadingAndErrorWrapper>
        <LeaveRouteConfirmModal
          isEnabled={isDirty && !isCallbackScheduled}
          route={route}
        />
      </ErrorBoundary>
    );
  },
);

const getSubmitError = (error: DatabaseEditErrorType) => {
  if (_.isObject(error?.data?.errors)) {
    return updateIn(error, ["data", "errors"], (errors) => ({
      details: errors,
    }));
  }

  return error;
};
