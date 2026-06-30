import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { FieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { isNumber } from "metabase/utils/types";
import { isObject } from "metabase-types/guards";

import type { BreakoutInput, ColumnBinningInput } from "./input-types";

export function getFieldId(field: unknown): number | null {
  if (hasFieldId(field)) {
    return field.fieldId;
  }

  if (isTableFieldSchema(field) && typeof field.id === "number") {
    return field.id;
  }

  return null;
}

export const hasFieldId = (
  value: unknown,
): value is FieldSchema & { fieldId: number } =>
  isObject(value) && "fieldId" in value && isNumber(value.fieldId);

export const normalizeBreakout = (
  breakout: BreakoutInput | unknown,
): {
  dimension: FieldSchema | null;
  options: Record<string, unknown>;
} => {
  if (isTableFieldSchema(breakout)) {
    return { dimension: breakout, options: {} };
  }

  if (
    isObject(breakout) &&
    "dimension" in breakout &&
    isTableFieldSchema(breakout.dimension)
  ) {
    const { dimension: _dimension, ...options } = breakout;
    return { dimension: breakout.dimension, options };
  }

  return { dimension: null, options: {} };
};

export function getBinningOptions(
  value: unknown,
): ColumnBinningInput | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  if (
    "bins" in value &&
    (typeof value.bins === "number" || value.bins === "auto")
  ) {
    return { bins: value.bins };
  }

  if (
    "binWidth" in value &&
    (typeof value.binWidth === "number" || value.binWidth === "auto")
  ) {
    return { binWidth: value.binWidth };
  }

  if ("binning" in value && isObject(value.binning)) {
    const binning = value.binning;
    if (
      binning.strategy === "num-bins" &&
      typeof binning["num-bins"] === "number"
    ) {
      return { bins: binning["num-bins"] };
    }
    if (
      binning.strategy === "bin-width" &&
      typeof binning["bin-width"] === "number"
    ) {
      return { binWidth: binning["bin-width"] };
    }
    if (binning.strategy === "default") {
      return { bins: "auto" };
    }
  }

  return undefined;
}
