import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";

import {
  isCountAggregation,
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
} from "./guards";
import type { TableQueryInput } from "./input-types";
import { normalizeBreakout } from "./input-utils";

export function validateTableQueryInput(input: TableQueryInput) {
  validateLimit(input.limit);
  validateGroupedQuery(input);
  validateTableScopedInputs(input);
}

function validateLimit(limit: number | undefined) {
  if (limit == null) {
    return;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Table query limit must be a positive integer.");
  }
}

function validateGroupedQuery(input: TableQueryInput) {
  if (!input.breakouts?.length || input.aggregations?.length) {
    return;
  }

  throw new Error(
    "Table queries with breakouts must include at least one aggregation.",
  );
}

function validateTableScopedInputs(input: TableQueryInput) {
  const tableId = input.source.id;

  input.filters?.forEach((filter) => {
    if (isSegmentSchema(filter)) {
      validateGeneratedTableId(filter.tableId, tableId, "Table query segments");
      return;
    }

    if (isDimensionFilter(filter) && isTableFieldSchema(filter.dimension)) {
      validateGeneratedTableId(
        filter.dimension.tableId,
        tableId,
        "Table query filters",
      );
      return;
    }

    throw new Error(
      "Table query filters must use generated fields or Segments.",
    );
  });

  input.fields?.forEach((field) =>
    validateGeneratedTableId(field.tableId, tableId, "Table query fields"),
  );

  input.aggregations?.forEach((aggregation) => {
    if (isMeasureSchema(aggregation)) {
      validateGeneratedTableId(
        aggregation.tableId,
        tableId,
        "Table query aggregations",
      );
      return;
    }

    if (isCountAggregation(aggregation)) {
      return;
    }

    if (
      isFieldAggregation(aggregation) &&
      isTableFieldSchema(aggregation.dimension)
    ) {
      validateGeneratedTableId(
        aggregation.dimension.tableId,
        tableId,
        "Table query aggregations",
      );
      return;
    }

    throw new Error(
      "Table query aggregations must use generated Measures or aggregation helpers.",
    );
  });

  input.breakouts?.forEach((breakout) => {
    const { dimension } = normalizeBreakout(breakout);
    validateGeneratedTableId(
      dimension?.tableId,
      tableId,
      "Table query breakouts",
    );
  });
}

function validateGeneratedTableId(
  actualTableId: number | undefined,
  expectedTableId: number,
  context: string,
) {
  if (actualTableId == null || actualTableId === expectedTableId) {
    return;
  }

  throw new Error(
    `${context} must belong to the query source table. Expected table id ${actualTableId} to equal ${expectedTableId}.`,
  );
}
