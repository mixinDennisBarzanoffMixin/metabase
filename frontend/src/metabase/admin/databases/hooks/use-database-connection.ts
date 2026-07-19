import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { getDefaultEngineKey } from "metabase/databases/utils/engine";
import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embedding/constants";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import type { DatabaseId, Engine, EngineKey } from "metabase-types/api";

interface UseDatabaseConnectionProps {
  databaseId?: string;
  engines: Record<EngineKey, Engine>;
  initial?: {
    engine: string;
    details?: Record<string, unknown>;
  };
}

export const useDatabaseConnection = ({
  databaseId,
  engines,
  initial,
}: UseDatabaseConnectionProps) => {
  const dispatch = useDispatch();
  const queryParams = new URLSearchParams(location.search);
  const file = location.pathname.includes("/veritly/source");
  const name = queryParams.get("name");
  const selected = queryParams.get("engine");
  const preselectedEngine = selected ? selected : getDefaultEngineKey(engines);
  const fromEmbeddingSetupGuide = queryParams.has(RETURN_TO_SETUP_GUIDE_PARAM);
  const addingNewDatabase = databaseId === undefined;

  const databaseReq = useGetDatabaseQuery(
    addingNewDatabase ? skipToken : { id: parseInt(databaseId, 10) },
  );

  const database = databaseReq.currentData
    ? databaseReq.currentData
    : {
        id: undefined,
        name: name ? name : undefined,
        is_attached_dwh: false,
        router_user_attribute: undefined,
        engine: initial ? initial.engine : preselectedEngine,
        ...(initial?.details ? { details: initial.details } : {}),
      };

  const handleCancel = () => {
    if (file) {
      if (database?.id) {
        dispatch(push(`/veritly/source/${database.id}`));
      }
      return;
    }
    dispatch(
      database?.id
        ? push(`/admin/databases/${database.id}`)
        : push(`/admin/databases`),
    );
  };

  const handleOnSubmit = (savedDB: { id: DatabaseId }) => {
    if (file) {
      window.parent.postMessage(
        {
          type: "veritly.metabase.source.saved",
          databaseId: savedDB.id,
        },
        "*",
      );
      dispatch(push(`/veritly/source/${savedDB.id}`));
      return;
    }
    if (addingNewDatabase) {
      const param = fromEmbeddingSetupGuide
        ? `?${RETURN_TO_SETUP_GUIDE_PARAM}=true`
        : "";
      dispatch(push(`/admin/databases/${savedDB.id}${param}`));
    } else {
      handleCancel();
    }
  };

  const title = addingNewDatabase
    ? t`Add a database`
    : t`Edit connection details`;

  const config = {
    engine: {
      fieldState: database
        ? PLUGIN_DB_ROUTING.getPrimaryDBEngineFieldState(database)
        : "disabled",
    },
  };

  return {
    database,
    databaseReq,
    addingNewDatabase,
    handleCancel,
    handleOnSubmit,
    title,
    config,
  };
};
