import { isObject } from "metabase-types/guards";

import {
  type MetricInput,
  type TableInput,
  isGeneratedMetricReference,
  isGeneratedTableReference,
  isMetricReference,
  isTableReference,
} from "./input-guards";

type ID = string | number;

export function getMetricIdFromInput(input: unknown): number | null {
  if (!isObject(input)) {
    return null;
  }

  if ("metric" in input && isMetricReference(input.metric)) {
    return input.metric.id;
  }

  return null;
}

export function getTableIdFromInput(input: unknown): ID | null {
  if (!isObject(input)) {
    return null;
  }

  if ("table" in input && isTableReference(input.table)) {
    return input.table.id;
  }

  return null;
}

export function getTableDatabaseIdFromInput(input: TableInput): number | null {
  if ("table" in input && isGeneratedTableReference(input.table)) {
    return input.table.databaseId;
  }

  return null;
}

export const getMetricMappedTableIdsFromInput = (
  input: MetricInput,
): readonly number[] | null =>
  isGeneratedMetricReference(input.metric) ? input.metric.mappedTableIds : null;
