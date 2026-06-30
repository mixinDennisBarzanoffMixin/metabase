import {
  isMetricInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { FieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import * as Lib from "metabase-lib";
import type {
  DatasetQuery,
  TestAggregationSpec,
  TestColumnSpec,
  TestFilterSpec,
  TestOrderBySpec,
  TestQuerySpec,
} from "metabase-types/api";

import {
  isCountAggregation,
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
} from "./guards";
import type {
  AggregationInput,
  BreakoutInput,
  FilterInput,
  MetricQueryInput,
  OrderByInput,
  TableQueryInput,
} from "./input-types";
import { getBinningOptions, normalizeBreakout } from "./input-utils";
import {
  createMetricMetadata,
  createTableMetadata,
} from "./lib-adapter/metadata";
import {
  validateMetricQueryInput,
  validateTableQueryInput,
} from "./validation";

type QueryInput = TableQueryInput | MetricQueryInput;

export type CreateMetabaseQuery = (input: QueryInput) => DatasetQuery;

export const createMetabaseQuery: CreateMetabaseQuery = (input: QueryInput) => {
  if (isMetricInput(input)) {
    validateMetricQueryInput(input);

    const provider = Lib.metadataProvider(
      input.source.databaseId ?? null,
      createMetricMetadata(input.source, input),
    );

    return Lib.toJsQuery(
      Lib.createTestQuery(provider, lowerMetricInput(input)),
    );
  }

  if (!isTableInput(input)) {
    throw new Error(
      "Table query object creation requires a source reference with id and databaseId.",
    );
  }

  validateTableQueryInput(input);

  const provider = Lib.metadataProvider(
    input.source.databaseId,
    createTableMetadata(input.source, input.source.databaseId, input),
  );

  return Lib.toJsQuery(Lib.createTestQuery(provider, lowerInput(input)));
};

function lowerMetricInput(input: MetricQueryInput): TestQuerySpec {
  return {
    stages: [
      {
        source: { type: "metric", id: input.source.id },
        filters: input.filters?.map(lowerFilter),
        aggregations: input.aggregations?.map(lowerAggregation),
        breakouts: input.breakouts?.map(lowerBreakout),
        limit: input.limit,
      },
    ],
  };
}

function lowerInput(input: TableQueryInput): TestQuerySpec {
  const stage = {
    source: { type: "table" as const, id: input.source.id },
    fields: input.fields?.map(lowerColumn),
    filters: input.filters?.map(lowerFilter),
    aggregations: input.aggregations?.map(lowerAggregation),
    breakouts: input.breakouts?.map(lowerBreakout),
    orderBys: input.orderBys?.map(lowerOrderBy),
    limit: input.limit,
  };

  return { stages: [stage] };
}

function lowerFilter(filter: FilterInput): TestFilterSpec {
  if (isSegmentSchema(filter)) {
    return { type: "segment", id: filter.id };
  }

  if (!isDimensionFilter(filter)) {
    throw new Error("Filters must use generated field or Segment references.");
  }

  const column = lowerColumn(filter.dimension);

  if (filter.operator === "between") {
    const [min, max] = filter.values ?? [];
    return {
      type: "operator",
      operator: filter.operator,
      args: [
        column,
        { type: "literal", value: min as string | number | boolean },
        { type: "literal", value: max as string | number | boolean },
      ],
    };
  }

  if ("value" in filter) {
    return {
      type: "operator",
      operator: filter.operator,
      args: [
        column,
        { type: "literal", value: filter.value as string | number | boolean },
      ],
    };
  }

  return {
    type: "operator",
    operator: filter.operator,
    args: [column],
  };
}

function lowerAggregation(aggregation: AggregationInput): TestAggregationSpec {
  if (isMeasureSchema(aggregation)) {
    return { type: "measure", id: aggregation.id };
  }

  if (isCountAggregation(aggregation)) {
    return { type: "operator", operator: "count", args: [] };
  }

  if (isFieldAggregation(aggregation)) {
    return {
      type: "operator",
      operator: aggregation.type,
      args: [lowerColumn(aggregation.dimension)],
    };
  }

  throw new Error(
    "Aggregations must use generated Measure refs or aggregation helpers.",
  );
}

function lowerBreakout(breakout: BreakoutInput): TestColumnSpec {
  const { dimension, options } = normalizeBreakout(breakout);

  if (!dimension) {
    throw new Error("Breakouts must use generated field references.");
  }

  return {
    ...lowerColumn(dimension),
    ...lowerColumnOptions({ ...options, ...getBinningOptions(options) }),
  };
}

function lowerOrderBy(orderBy: OrderByInput): TestOrderBySpec {
  return {
    type: "column",
    name: orderBy.name,
    direction: orderBy.direction,
    unit: orderBy.unit,
    ...getBinningOptions(orderBy),
  };
}

function lowerColumn(field: FieldSchema): TestColumnSpec {
  return {
    type: "column",
    name: field.name,
  };
}

function lowerColumnOptions(options: Record<string, unknown>) {
  return {
    unit: options.unit,
    ...getBinningOptions(options),
  };
}
