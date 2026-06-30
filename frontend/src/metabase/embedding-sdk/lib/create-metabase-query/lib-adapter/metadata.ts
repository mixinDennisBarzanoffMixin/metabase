import type {
  FieldSchema,
  MeasureSchema,
  MetricSchema,
  SegmentSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { Metadata as MetadataInput } from "metabase-lib";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

import {
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
} from "../guards";
import type { MetricQueryInput, TableQueryInput } from "../input-types";
import { getFieldId, normalizeBreakout } from "../input-utils";

import { getFieldBaseType, getFieldEffectiveType } from "./query-utils";

type TableMetadataSource = Omit<TableSchema, "id"> & { id: TableId };

export function createTableMetadata(
  table: TableMetadataSource,
  databaseId: number,
  query?: TableQueryInput,
): MetadataInput {
  const fields = getTableFields(table, query);
  const segments = getTableSegments(table, query);
  const measures = getTableMeasures(table, query);

  return {
    databases: { [databaseId]: createDatabaseMetadata(databaseId) },
    tables: { [table.id]: createTableMetadataRecord(table, databaseId) },
    fields: Object.fromEntries(
      fields.map((field, index) => [
        getFieldId(field),
        createFieldMetadataRecord(field, table.id, index),
      ]),
    ),
    segments: Object.fromEntries(
      segments.map((segment) => [
        segment.id,
        createSegmentMetadataRecord(segment, table.id),
      ]),
    ),
    measures: Object.fromEntries(
      measures.map((measure) => [
        measure.id,
        createMeasureMetadataRecord(measure, table.id, databaseId),
      ]),
    ),
  };
}

export function createMetricMetadata(
  metric: MetricSchema,
  query?: MetricQueryInput,
): MetadataInput {
  const databaseId = metric.databaseId;
  const sourceTableId = metric.sourceTableId;
  const sourceCardId = metric.sourceCardId;
  const sourceId = getMetricSourceId(metric);

  if (databaseId == null || sourceId == null) {
    throw new Error(
      "Metric query object creation requires a generated Metric reference with databaseId and sourceTableId or sourceCardId.",
    );
  }

  const fields = getMetricFields(metric);
  const segments = getMetricSegments(metric, query);
  const measures = getMetricMeasures(metric, query);
  const tables = getMetricTables(metric, sourceId, fields, segments, measures);
  const questions =
    sourceCardId == null
      ? {}
      : {
          [sourceCardId]: createQuestionMetadataRecord(
            sourceCardId,
            databaseId,
            sourceId,
            fields,
          ),
        };

  return {
    databases: { [databaseId]: createDatabaseMetadata(databaseId) },
    tables: Object.fromEntries(
      tables.map((tableId) => [
        tableId,
        createTableMetadataRecord({ id: tableId, databaseId }, databaseId),
      ]),
    ),
    fields: Object.fromEntries(
      fields.map((field, index) => [
        getFieldId(field),
        createFieldMetadataRecord(field, sourceId, index),
      ]),
    ),
    segments: Object.fromEntries(
      segments.map((segment) => [
        segment.id,
        createSegmentMetadataRecord(segment, segment.tableId ?? sourceId),
      ]),
    ),
    questions: {
      [metric.id]: createMetricMetadataRecord(
        metric,
        sourceTableId ?? null,
        sourceCardId ?? null,
        databaseId,
      ),
      ...questions,
    },
    measures: Object.fromEntries(
      measures.map((measure) => [
        measure.id,
        createMeasureMetadataRecord(measure, sourceId, databaseId),
      ]),
    ),
  };
}

const createDatabaseMetadata = (databaseId: number) => ({
  id: databaseId,
  name: `Database ${databaseId}`,
  features: ["basic-aggregations", "binning", "expressions"],
});

const createTableMetadataRecord = (
  table: TableMetadataSource,
  databaseId: number,
) => ({
  id: table.id,
  db_id: databaseId,
  display_name: `Table ${table.id}`,
  name: `table_${table.id}`,
});

const createFieldMetadataRecord = (
  field: FieldSchema,
  tableId: TableId,
  index: number,
) => ({
  id: getFieldId(field) ?? index,
  table_id: tableId,
  name: field.name,
  display_name: field.displayName ?? field.name,
  description: field.description ?? null,
  base_type: getFieldBaseType(field),
  effective_type: getFieldEffectiveType(field),
  position: index,
});

const createSegmentMetadataRecord = (
  segment: SegmentSchema,
  tableId: TableId,
) => ({
  ...segment,
  name: `Segment ${segment.id}`,
  table_id: segment.tableId ?? tableId,
});

const createMeasureMetadataRecord = (
  measure: MeasureSchema,
  tableId: TableId,
  databaseId: number,
) => ({
  ...measure,
  name: `Measure ${measure.id}`,
  table_id: measure.tableId ?? tableId,
  definition: {
    type: "query",
    database: databaseId,
    query: {
      "source-table": measure.tableId ?? tableId,
      aggregation: [["count"]],
    },
  },
});

const createMetricMetadataRecord = (
  metric: MetricSchema,
  sourceTableId: TableId | null,
  sourceCardId: number | null,
  databaseId: number,
) => ({
  id: metric.id,
  name: metric.columns[0]?.displayName ?? `Metric ${metric.id}`,
  type: "metric",
  table_id: sourceTableId,
  source_card_id: sourceCardId,
  database_id: databaseId,
  dataset_query: {
    type: "query",
    database: databaseId,
    query: {
      "source-table":
        sourceTableId == null && sourceCardId != null
          ? getQuestionVirtualTableId(sourceCardId)
          : sourceTableId,
      aggregation: [["count"]],
    },
  },
});

const createQuestionMetadataRecord = (
  cardId: number,
  databaseId: number,
  tableId: TableId,
  fields: readonly FieldSchema[],
) => ({
  id: cardId,
  name: `Question ${cardId}`,
  display: "table",
  type: "question",
  result_metadata: fields.map((field, index) =>
    createFieldMetadataRecord(field, tableId, index),
  ),
  dataset_query: {
    type: "query",
    database: databaseId,
    query: { "source-table": getQuestionVirtualTableId(cardId) },
  },
});

const getTableFields = (
  table: TableMetadataSource,
  query?: TableQueryInput,
): FieldSchema[] =>
  getUniqueFields([
    ...Object.values(table.fields ?? {}).filter(hasFieldReferenceId),
    ...getQueryFieldReferences(query),
  ]);

const getTableSegments = (
  table: TableMetadataSource,
  query?: TableQueryInput,
): SegmentSchema[] =>
  getUniqueById([
    ...Object.values(table.segments ?? {}),
    ...(query?.filters?.filter(isSegmentSchema).map((segment) => ({
      ...segment,
      tableId: Number(segment.tableId ?? table.id),
    })) ?? []),
  ]);

const getTableMeasures = (
  table: TableMetadataSource,
  query?: TableQueryInput,
): MeasureSchema[] =>
  getUniqueById([
    ...Object.values(table.measures ?? {}),
    ...(query?.aggregations?.filter(isMeasureSchema).map((measure) => ({
      ...measure,
      tableId: Number(measure.tableId ?? table.id),
      columns: measure.columns ?? [],
    })) ?? []),
  ]);

const getMetricFields = (metric: MetricSchema): FieldSchema[] =>
  getUniqueFields(
    Object.values(metric.dimensions ?? {}).flatMap((dimensionGroup) =>
      Object.values(dimensionGroup).filter(hasFieldReferenceId),
    ),
  );

const getMetricSegments = (
  metric: MetricSchema,
  query?: MetricQueryInput,
): SegmentSchema[] =>
  getUniqueById(
    query?.filters?.filter(isSegmentSchema).map((segment) => ({
      ...segment,
      tableId: Number(segment.tableId ?? metric.sourceTableId),
    })) ?? [],
  );

const getMetricMeasures = (
  metric: MetricSchema,
  query?: MetricQueryInput,
): MeasureSchema[] =>
  getUniqueById(
    query?.aggregations?.filter(isMeasureSchema).map((measure) => ({
      ...measure,
      tableId: Number(measure.tableId ?? metric.sourceTableId),
      columns: measure.columns ?? [],
    })) ?? [],
  );

const getMetricTables = (
  metric: MetricSchema,
  sourceId: TableId,
  fields: readonly FieldSchema[],
  segments: readonly SegmentSchema[],
  measures: readonly MeasureSchema[],
): TableId[] =>
  getUniqueIds([
    sourceId,
    metric.sourceTableId,
    ...(metric.mappedTableIds ?? []),
    ...fields.map((field) => field.tableId),
    ...segments.map((segment) => segment.tableId),
    ...measures.map((measure) => measure.tableId),
  ]);

function getQueryFieldReferences(query?: TableQueryInput): FieldSchema[] {
  const selectedFields = query?.fields ?? [];

  const filterFields =
    query?.filters?.flatMap((filter) =>
      isDimensionFilter(filter) ? [filter.dimension] : [],
    ) ?? [];

  const aggregationFields =
    query?.aggregations?.flatMap((aggregation) =>
      isFieldAggregation(aggregation) ? [aggregation.dimension] : [],
    ) ?? [];

  const breakoutFields =
    query?.breakouts?.flatMap((breakout) => {
      const { dimension } = normalizeBreakout(breakout);

      return dimension ? [dimension] : [];
    }) ?? [];

  const orderByFields =
    query?.orderBys?.flatMap((orderBy) =>
      orderBy.dimension ? [orderBy.dimension] : [],
    ) ?? [];

  return [
    ...selectedFields,
    ...filterFields,
    ...aggregationFields,
    ...breakoutFields,
    ...orderByFields,
  ].filter(hasFieldReferenceId);
}

const getUniqueById = <T extends { id: number }>(items: readonly T[]): T[] =>
  Array.from(new Map(items.map((item) => [item.id, item])).values());

const getUniqueFields = (fields: readonly FieldSchema[]): FieldSchema[] =>
  Array.from(
    new Map(fields.map((field) => [getFieldId(field), field])).values(),
  );

const getUniqueIds = (
  ids: readonly (TableId | undefined | null)[],
): TableId[] =>
  Array.from(new Set(ids.filter((id): id is TableId => id != null)));

const hasFieldReferenceId = (field: FieldSchema): boolean =>
  getFieldId(field) !== null;

function getMetricSourceId(metric: MetricSchema): TableId | null {
  if (metric.sourceTableId != null) {
    return metric.sourceTableId;
  }

  if (metric.sourceCardId != null) {
    return getQuestionVirtualTableId(metric.sourceCardId);
  }

  return null;
}
