import { isObject } from "metabase-types/guards";

import type { FieldSchema, TableSchema } from "./schema";

type ID = string | number;

export type QuestionInput = { questionId: ID; parameters?: unknown };
export type TableInput = { source?: TableSchema };

export const isQuestionInput = (input: unknown): input is QuestionInput =>
  isObject(input) && "questionId" in input && isId(input.questionId);

export const isTableInput = (input: unknown): input is TableInput =>
  isObject(input) && "source" in input && isTableReference(input.source);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) &&
  typeof value.id === "number" &&
  (!("type" in value) || value.type === "table") &&
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
