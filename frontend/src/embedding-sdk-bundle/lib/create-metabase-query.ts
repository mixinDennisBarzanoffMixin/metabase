import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { getTableIdFromInput } from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import { isTableInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import {
  createMetabaseQuery as createMetabaseQueryFromGeneratedSchema,
  createMetabaseQueryFromMetadata,
} from "metabase/embedding-sdk/lib/create-metabase-query";
import type {
  MetricQueryInput,
  TableQueryInput,
} from "metabase/embedding-sdk/lib/create-metabase-query/input-types";
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
  async ({ query, reloadMetadata = true }: CreateMetabaseQueryParams) => {
    if (!isTableInput(query)) {
      return createMetabaseQueryFromGeneratedSchema(query);
    }

    const tableId = getTableIdFromInput(query);

    if (tableId == null) {
      return createMetabaseQueryFromGeneratedSchema(query);
    }

    await store.dispatch(
      fetchTableMetadata({ id: Number(tableId) }, { reload: reloadMetadata }),
    );

    return createMetabaseQueryFromMetadata(
      query,
      getMetadata(store.getState()),
    );
  };
