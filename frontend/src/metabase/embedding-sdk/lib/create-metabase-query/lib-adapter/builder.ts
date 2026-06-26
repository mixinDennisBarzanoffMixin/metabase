import {
  getMetricIdFromInput,
  getTableDatabaseIdFromInput,
  getTableIdFromInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import type { Metadata as MetadataInput, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import type { MetricQueryInput, TableQueryInput } from "../input-types";

import {
  applyAggregations,
  applyMetricAggregation,
  applyMetricMeasures,
} from "./aggregations";
import { applyBreakouts } from "./breakouts";
import {
  applyFilters,
  buildLibMetricFilter,
  buildLibTableFilter,
} from "./filters";
import {
  createLibQuery,
  getDatabaseIdFromMetadata,
  getMetricQuerySourceFromMetadata,
} from "./metadata";

export function buildTableDatasetQueryFromMetadata(
  input: TableQueryInput,
  metadata: MetadataInput,
): DatasetQuery | null {
  const tableId = getTableIdFromInput(input);

  if (tableId == null) {
    return null;
  }

  const databaseId =
    getTableDatabaseIdFromInput(input) ??
    getDatabaseIdFromMetadata(metadata, Number(tableId));

  if (databaseId == null) {
    return null;
  }

  const libQuery = createLibQuery(
    metadata,
    Number(databaseId),
    Number(tableId),
  );

  return buildTableDatasetQuery(input, libQuery);
}

function buildTableDatasetQuery(
  input: TableQueryInput,
  initialLibQuery: Query,
): DatasetQuery | null {
  let libQuery = initialLibQuery;

  const queryWithFilters = applyFilters(
    libQuery,
    input.filters,
    buildLibTableFilter,
  );

  if (!queryWithFilters) {
    return null;
  }

  libQuery = queryWithFilters;

  const queryWithAggregations = applyAggregations(
    libQuery,
    input.aggregations ?? input.measures,
    { addDefaultCount: Boolean(input.breakouts?.length) },
  );

  if (!queryWithAggregations) {
    return null;
  }

  libQuery = queryWithAggregations;

  const queryWithBreakouts = applyBreakouts(libQuery, input.breakouts);

  if (!queryWithBreakouts) {
    return null;
  }

  return Lib.toJsQuery(queryWithBreakouts);
}

export function buildMetricDatasetQueryFromMetadata(
  input: MetricQueryInput,
  metadata: MetadataInput,
): DatasetQuery | null {
  const metricId = getMetricIdFromInput(input);
  const metricSource =
    metricId == null
      ? null
      : getMetricQuerySourceFromMetadata(metadata, Number(metricId));

  if (metricId == null || metricSource == null) {
    return null;
  }

  let libQuery = createLibQuery(
    metadata,
    metricSource.databaseId,
    metricSource.sourceId,
  );

  const queryWithMetric = applyMetricAggregation(libQuery, Number(metricId));

  if (!queryWithMetric) {
    return null;
  }

  libQuery = queryWithMetric;

  const queryWithMeasures = applyMetricMeasures(libQuery, input.measures);

  if (!queryWithMeasures) {
    return null;
  }

  libQuery = queryWithMeasures;

  const queryWithFilters = applyFilters(
    libQuery,
    input.filters,
    buildLibMetricFilter,
  );

  if (!queryWithFilters) {
    return null;
  }

  libQuery = queryWithFilters;

  const queryWithBreakouts = applyBreakouts(libQuery, input.breakouts);

  if (!queryWithBreakouts) {
    return null;
  }

  return Lib.toJsQuery(queryWithBreakouts);
}
