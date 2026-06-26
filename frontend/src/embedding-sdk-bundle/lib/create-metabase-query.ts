import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  getMetricIdFromInput,
  getTableIdFromInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import { isTableInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { createMetabaseQueryFromMetadata } from "metabase/embedding-sdk/lib/create-metabase-query";
import type {
  MetricQueryInput,
  TableQueryInput,
} from "metabase/embedding-sdk/lib/create-metabase-query/input-types";
import { fetchCardQueryMetadata } from "metabase/redux/cards";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadata } from "metabase/selectors/metadata";
import type { DatasetQuery } from "metabase-types/api";

export type CreateMetabaseQueryParams = {
  query: TableQueryInput | MetricQueryInput;
  reloadMetadata?: boolean;
};

export type CreateMetabaseQuery = (
  params: CreateMetabaseQueryParams,
) => Promise<DatasetQuery>;

export const createMetabaseQuery =
  (store: SdkStore): CreateMetabaseQuery =>
  async ({ query, reloadMetadata = false }: CreateMetabaseQueryParams) => {
    await store.dispatch(loadQueryMetadata(query, { reload: reloadMetadata }));

    return createMetabaseQueryFromMetadata(
      query,
      getMetadata(store.getState()),
    );
  };

const loadQueryMetadata = (
  query: TableQueryInput | MetricQueryInput,
  { reload }: { reload: boolean },
) => {
  if (isTableInput(query)) {
    const tableId = getTableIdFromInput(query);

    if (tableId == null) {
      throw new Error("Table query object creation requires a table id.");
    }

    return fetchTableMetadata({ id: Number(tableId) }, { reload });
  }

  const metricId = getMetricIdFromInput(query);

  if (metricId == null) {
    throw new Error("Metric query object creation requires a metric id.");
  }

  return fetchCardQueryMetadata({ id: metricId }, { reload });
};
