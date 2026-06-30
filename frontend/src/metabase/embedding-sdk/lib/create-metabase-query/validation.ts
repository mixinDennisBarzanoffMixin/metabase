import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";

import {
  isCountAggregation,
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
} from "./guards";
import type { MetricQueryInput, TableQueryInput } from "./input-types";
import { normalizeBreakout } from "./input-utils";

export function validateTableQueryInput(input: TableQueryInput) {
  validateLimit(input.limit, "Table query");
  validateGroupedQuery(input);
  validateTableScopedInputs(input);
}

export function validateMetricQueryInput(input: MetricQueryInput) {
  validateLimit(input.limit, "Metric query");

  const allowedTableIds = getMetricAllowedTableIds(input.source);

  input.filters?.forEach((filter) => {
    if (isSegmentSchema(filter)) {
      validateGeneratedTableIdInSet(
        filter.tableId,
        allowedTableIds,
        "Metric query segments",
      );
      return;
    }

    if (isDimensionFilter(filter) && isTableFieldSchema(filter.dimension)) {
      validateMetricDimension(input, filter.dimension, "Metric query filters");
      validateGeneratedTableIdInSet(
        filter.dimension.tableId,
        allowedTableIds,
        "Metric query filters",
      );
      return;
    }

    throw new Error(
      "Metric query filters must use generated Metric dimensions or mapped-table Segments.",
    );
  });

  input.aggregations?.forEach((aggregation) => {
    if (isMeasureSchema(aggregation)) {
      validateGeneratedTableIdInSet(
        aggregation.tableId,
        allowedTableIds,
        "Metric query aggregations",
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
      validateMetricDimension(
        input,
        aggregation.dimension,
        "Metric query aggregations",
      );
      validateGeneratedTableIdInSet(
        aggregation.dimension.tableId,
        allowedTableIds,
        "Metric query aggregations",
      );
      return;
    }

    throw new Error(
      "Metric query aggregations must use generated Measures or aggregation helpers over generated Metric dimensions.",
    );
  });

  input.breakouts?.forEach((breakout) => {
    const { dimension } = normalizeBreakout(breakout);

    if (!dimension) {
      throw new Error(
        "Metric query breakouts must use generated Metric dimensions.",
      );
    }

    validateMetricDimension(input, dimension, "Metric query breakouts");
    validateGeneratedTableIdInSet(
      dimension.tableId,
      allowedTableIds,
      "Metric query breakouts",
    );
  });
}

function validateLimit(limit: number | undefined, context: string) {
  if (limit == null) {
    return;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`${context} limit must be a positive integer.`);
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

function validateGeneratedTableIdInSet(
  actualTableId: number | undefined,
  expectedTableIds: readonly number[] | null,
  context: string,
) {
  if (
    actualTableId == null ||
    expectedTableIds == null ||
    expectedTableIds.includes(actualTableId)
  ) {
    return;
  }

  throw new Error(
    `${context} must belong to one of the Metric's mapped tables. Expected table id ${actualTableId} to be one of ${expectedTableIds.join(
      ", ",
    )}.`,
  );
}

function validateMetricDimension(
  input: MetricQueryInput,
  field: NonNullable<ReturnType<typeof normalizeBreakout>["dimension"]>,
  context: string,
) {
  const dimension = getMetricDimensionFields(input).find((dimension) =>
    fieldsMatch(dimension, field),
  );

  if (dimension) {
    return;
  }

  throw new Error(`${context} must use generated Metric dimensions.`);
}

function getMetricAllowedTableIds(metric: MetricQueryInput["source"]) {
  if (metric.mappedTableIds?.length) {
    return metric.mappedTableIds;
  }

  if (metric.sourceTableId != null) {
    return [metric.sourceTableId];
  }

  return null;
}

function getMetricDimensionFields(input: MetricQueryInput) {
  return Object.values(input.source.dimensions ?? {}).flatMap(
    (dimensionGroup) =>
      Object.values(dimensionGroup).filter(isTableFieldSchema),
  );
}

function fieldsMatch(
  left: NonNullable<ReturnType<typeof normalizeBreakout>["dimension"]>,
  right: NonNullable<ReturnType<typeof normalizeBreakout>["dimension"]>,
) {
  return (
    left.tableId === right.tableId &&
    ((left.fieldId != null && left.fieldId === right.fieldId) ||
      left.name === right.name)
  );
}
