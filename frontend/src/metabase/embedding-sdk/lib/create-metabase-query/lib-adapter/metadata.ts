import type {
  FieldSchema,
  MeasureSchema,
  SegmentSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { Metadata as MetadataInput } from "metabase-lib";
import type { TableId } from "metabase-types/api";

import {
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
} from "../guards";
import type { TableQueryInput } from "../input-types";
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

const hasFieldReferenceId = (field: FieldSchema): boolean =>
  getFieldId(field) !== null;
