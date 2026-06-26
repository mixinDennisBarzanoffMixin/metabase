import type { Metadata as MetadataInput, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { TableId } from "metabase-types/api";

export function createLibQuery(
  metadata: MetadataInput,
  databaseId: number,
  tableId: TableId,
): Query {
  const provider = Lib.metadataProvider(databaseId, metadata);
  const table = Lib.tableOrCardMetadata(provider, tableId);

  if (!table) {
    throw new Error("Query creation requires table metadata.");
  }

  return Lib.queryFromTableOrCardMetadata(provider, table);
}

export function getDatabaseIdFromMetadata(
  metadata: MetadataInput,
  tableId: TableId,
): number | null {
  const table = getTableMetadataRecord(metadata, tableId);
  const databaseId = table?.db_id ?? table?.db?.id;

  return typeof databaseId === "number" ? databaseId : null;
}

export function getMetricQuerySourceFromMetadata(
  metadata: MetadataInput,
  metricId: number,
): { databaseId: number; sourceId: TableId } | null {
  const datasetQuery = getQuestionDatasetQuery(metadata, metricId);

  if (!isStructuredDatasetQuery(datasetQuery)) {
    return null;
  }

  const sourceId = getQuerySourceId(datasetQuery.query);

  return sourceId == null
    ? null
    : { databaseId: datasetQuery.database, sourceId };
}

type TableMetadataRecord = {
  db_id?: unknown;
  db?: {
    id?: unknown;
  };
};

const getTableMetadataRecord = (
  metadata: MetadataInput,
  tableId: TableId,
): TableMetadataRecord | null => {
  const metadataWithTables = metadata as {
    tables?: Record<string | number, TableMetadataRecord>;
    table?: (id: TableId) => TableMetadataRecord | null;
  };

  return (
    metadataWithTables.tables?.[tableId] ??
    metadataWithTables.tables?.[String(tableId)] ??
    metadataWithTables.table?.(tableId) ??
    null
  );
};

type StructuredDatasetQueryRecord = {
  type: "query";
  database: number;
  query: Record<string, unknown>;
};

function getQuestionDatasetQuery(
  metadata: MetadataInput,
  cardId: number,
): unknown {
  const question = getQuestionMetadataRecord(metadata, cardId);

  if (!isRecord(question)) {
    return null;
  }

  if (
    "datasetQuery" in question &&
    typeof question.datasetQuery === "function"
  ) {
    return question.datasetQuery();
  }

  if ("dataset_query" in question) {
    return question.dataset_query;
  }

  if ("_card" in question && isRecord(question._card)) {
    return question._card.dataset_query;
  }

  return null;
}

function getQuestionMetadataRecord(
  metadata: MetadataInput,
  cardId: number,
): unknown {
  const metadataWithQuestions = metadata as {
    questions?: Record<string | number, unknown>;
    question?: (id: number) => unknown;
  };

  return (
    metadataWithQuestions.question?.(cardId) ??
    metadataWithQuestions.questions?.[cardId] ??
    metadataWithQuestions.questions?.[String(cardId)] ??
    null
  );
}

function isStructuredDatasetQuery(
  query: unknown,
): query is StructuredDatasetQueryRecord {
  return (
    isRecord(query) &&
    query.type === "query" &&
    typeof query.database === "number" &&
    isRecord(query.query)
  );
}

function getQuerySourceId(query: Record<string, unknown>): TableId | null {
  const sourceTable = query["source-table"];

  if (typeof sourceTable === "number" || typeof sourceTable === "string") {
    return sourceTable;
  }

  const sourceCardId = query["source-card"];

  return typeof sourceCardId === "number"
    ? getQuestionVirtualTableId(sourceCardId)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
