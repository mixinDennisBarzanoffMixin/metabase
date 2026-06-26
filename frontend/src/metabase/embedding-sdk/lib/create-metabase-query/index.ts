import { getTableIdFromInput } from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import type { Metadata as MetadataInput } from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import type { MetricQueryInput, TableQueryInput } from "./input-types";
import { isMetricQueryInput } from "./input-utils";
import {
  buildMetricDatasetQueryFromInput,
  buildTableDatasetQueryFromMetadata,
} from "./lib-adapter/builder";
import {
  validateMetricGeneratedDimensions,
  validateMetricTableScopedInputs,
  validateTableScopedInputs,
} from "./validation";

export type CreateMetabaseQuery = (input: MetricQueryInput) => DatasetQuery;

export type CreateMetabaseQueryFromMetadata = (
  input: TableQueryInput | MetricQueryInput,
  metadata: MetadataInput,
) => DatasetQuery;

export const createMetabaseQuery: CreateMetabaseQuery = (input) => {
  const datasetQuery = buildValidatedMetricQueryFromInput(input);

  if (datasetQuery) {
    return datasetQuery;
  }

  throw new Error(
    "Metric query object creation requires the metric's generated schema.",
  );
};

export const createMetabaseQueryFromMetadata: CreateMetabaseQueryFromMetadata =
  (input: TableQueryInput | MetricQueryInput, metadata: MetadataInput) => {
    if (isMetricQueryInput(input)) {
      return createMetabaseQuery(input);
    }

    const datasetQuery = buildValidatedTableQueryFromMetadata(input, metadata);

    if (datasetQuery) {
      return datasetQuery;
    }

    throw new Error(
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Internal SDK developer error.
      "Table query object creation requires loaded Metabase metadata.",
    );
  };

function buildValidatedTableQueryFromMetadata(
  input: TableQueryInput,
  metadata: MetadataInput,
): DatasetQuery | null {
  const tableId = getTableIdFromInput(input);

  if (tableId == null) {
    return null;
  }

  validateTableScopedInputs({
    allowedTableIds: [Number(tableId)],
    filters: input.filters,
    measures: input.aggregations ?? input.measures,
    context: "Table query",
  });

  return buildTableDatasetQueryFromMetadata(input, metadata);
}

function buildValidatedMetricQueryFromInput(
  input: MetricQueryInput,
): DatasetQuery | null {
  validateMetricTableScopedInputs(input);
  validateMetricGeneratedDimensions(input);

  return buildMetricDatasetQueryFromInput(input);
}
