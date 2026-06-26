import { isObject } from "metabase-types/guards";

import type {
  FieldSchema,
  MetricIdReference,
  MetricSchema,
  TableIdReference,
  TableSchema,
} from "./schema";

type ID = string | number;

export type GeneratedMetricReferenceLike = Pick<MetricSchema, "dimensions"> & {
  id: number;
  databaseId?: number;
  sourceTableId?: number;
  sourceCardId?: number;
  mappedTableIds: readonly number[];
  columns?: MetricSchema["columns"];
};

export type MetricReferenceLike =
  | MetricIdReference
  | GeneratedMetricReferenceLike;

export type TableReferenceLike = TableIdReference | TableSchema;

export type QuestionInput = { questionId: ID; parameters?: unknown };
export type TableInput = { table?: TableReferenceLike };
export type MetricInput = { metric?: MetricReferenceLike };

export const isQuestionInput = (input: unknown): input is QuestionInput =>
  isObject(input) && "questionId" in input && isId(input.questionId);

export const isTableInput = (input: unknown): input is TableInput =>
  isObject(input) && "table" in input && isTableReference(input.table);

export const isMetricInput = (input: unknown): input is MetricInput =>
  isObject(input) && "metric" in input && isMetricReference(input.metric);

export const isMetricReference = (
  value: unknown,
): value is MetricReferenceLike =>
  isObject(value) && typeof value.id === "number";

export const isGeneratedMetricReference = (
  value: unknown,
): value is GeneratedMetricReferenceLike =>
  isMetricReference(value) &&
  "mappedTableIds" in value &&
  Array.isArray(value.mappedTableIds) &&
  value.mappedTableIds.every((id) => typeof id === "number");

export const isTableReference = (value: unknown): value is TableReferenceLike =>
  isObject(value) && typeof value.id === "number";

export const isGeneratedTableReference = (
  value: unknown,
): value is TableSchema =>
  isTableReference(value) &&
  "databaseId" in value &&
  typeof value.databaseId === "number";

export const isId = (value: unknown): value is ID =>
  typeof value === "string" || typeof value === "number";

export function isTableFieldSchema(value: unknown): value is FieldSchema {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    (typeof value.fieldId === "number" ||
      typeof value.id === "number" ||
      typeof value.id === "string")
  );
}

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";
