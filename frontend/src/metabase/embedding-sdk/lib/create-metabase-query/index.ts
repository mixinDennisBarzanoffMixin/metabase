import {
  getMetricIdFromInput,
  getTableIdFromInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import type { Metadata as MetadataInput } from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import type { MetricQueryInput, TableQueryInput } from "./input-types";
import { isMetricQueryInput } from "./input-utils";
import {
  buildMetricDatasetQueryFromMetadata,
  buildTableDatasetQueryFromMetadata,
} from "./lib-adapter/builder";
import {
  validateMetricGeneratedDimensions,
  validateMetricTableScopedInputs,
  validateTableScopedInputs,
} from "./validation";

export type CreateMetabaseQueryFromMetadata = (
  input: TableQueryInput | MetricQueryInput,
  metadata: MetadataInput,
) => DatasetQuery;

export const createMetabaseQueryFromMetadata: CreateMetabaseQueryFromMetadata =
  (input: TableQueryInput | MetricQueryInput, metadata: MetadataInput) => {
    if (isMetricQueryInput(input)) {
      const datasetQuery = buildValidatedMetricQueryFromMetadata(
        input,
        metadata,
      );

      if (datasetQuery) {
        return datasetQuery;
      }

      throw new Error(
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Internal SDK developer error.
        "Metric query object creation requires loaded Metabase metadata.",
      );
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

function buildValidatedMetricQueryFromMetadata(
  input: MetricQueryInput,
  metadata: MetadataInput,
): DatasetQuery | null {
  const metricId = getMetricIdFromInput(input);

  if (metricId == null) {
    return null;
  }

  validateMetricTableScopedInputs(input);
  validateMetricGeneratedDimensions(input);

  return buildMetricDatasetQueryFromMetadata(input, metadata);
}
