import { isObject } from "metabase-types/guards";

import type { FieldSchema, MetricSchema, TableSchema } from "./schema";

type ID = string | number;

export type QuestionInput = { questionId: ID; parameters?: unknown };
export type TableInput = { source?: TableSchema };
export type MetricInput = { source?: MetricSchema };

export const isQuestionInput = (input: unknown): input is QuestionInput =>
  isObject(input) && "questionId" in input && isId(input.questionId);

export const isTableInput = (input: unknown): input is TableInput =>
  isObject(input) && "source" in input && isTableReference(input.source);

export const isMetricInput = (input: unknown): input is MetricInput =>
  isObject(input) && "source" in input && isMetricReference(input.source);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) &&
  typeof value.id === "number" &&
  (!("type" in value) || value.type === "table") &&
  typeof value.databaseId === "number";

export const isMetricReference = (value: unknown): value is MetricSchema =>
  isObject(value) &&
  typeof value.id === "number" &&
  (!("type" in value) || value.type === "metric") &&
  (typeof value.sourceTableId === "number" ||
    typeof value.sourceCardId === "number");

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
