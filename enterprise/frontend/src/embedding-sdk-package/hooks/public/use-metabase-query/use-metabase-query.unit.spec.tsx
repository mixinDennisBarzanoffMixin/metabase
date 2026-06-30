import { createMetabaseQuery as createMetabaseQueryInBundle } from "metabase/embedding-sdk/lib/create-metabase-query";
import type { DatasetQuery } from "metabase-types/api";

import type { MetabaseQueryOptions } from "./use-metabase-query";
import {
  breakout,
  count,
  filter,
  orderBy,
  sum,
  useMetabaseQuery,
} from "./use-metabase-query";

const TEST_SCHEMA = {
  tables: {
    orders: {
      type: "table",
      id: 1,
      databaseId: 1,
      fields: {
        id: {
          type: "column",
          fieldId: 100,
          tableId: 1,
          name: "ID",
          displayName: "ID",
          jsType: "number",
        },
        createdAt: {
          type: "column",
          fieldId: 103,
          tableId: 1,
          name: "CREATED_AT",
          displayName: "Created At",
          jsType: "Date",
          baseType: "type/DateTime",
        },
        amount: {
          type: "column",
          fieldId: 102,
          tableId: 1,
          name: "AMOUNT",
          displayName: "Amount",
          jsType: "number",
        },
        status: {
          type: "column",
          fieldId: 101,
          tableId: 1,
          name: "STATUS",
          displayName: "Status",
          jsType: "string",
        },
        franchiseId: {
          type: "column",
          fieldId: 106,
          tableId: 1,
          name: "FRANCHISE_ID",
          displayName: "Franchise ID",
          jsType: "number",
        },
        internalCode: {
          type: "column",
          fieldId: 104,
          tableId: 1,
          name: "INTERNAL_CODE",
          displayName: "Internal Code",
          jsType: "string",
        },
      },
      segments: {
        completed: { type: "segment", id: 11, tableId: 1 },
      },
      measures: {
        revenue: {
          type: "measure",
          id: 21,
          tableId: 1,
          columns: [{ name: "sum", displayName: "Sum", jsType: "number" }],
        },
      },
    },
    products: {
      type: "table",
      id: 2,
      databaseId: 1,
      fields: {
        price: {
          type: "column",
          fieldId: 201,
          tableId: 2,
          name: "PRICE",
          displayName: "Price",
          jsType: "number",
        },
      },
      segments: {
        active: { type: "segment", id: 12, tableId: 2 },
      },
      measures: {
        price: {
          type: "measure",
          id: 22,
          tableId: 2,
          columns: [{ name: "price", displayName: "Price", jsType: "number" }],
        },
      },
    },
    franchises: {
      type: "table",
      id: 3,
      databaseId: 1,
      fields: {
        name: {
          type: "column",
          fieldId: 301,
          tableId: 3,
          sourceFieldId: 106,
          name: "NAME",
          displayName: "Name",
          jsType: "string",
        },
      },
    },
  },
  metrics: {
    revenue: {
      id: 31,
      databaseId: 1,
      sourceTableId: 1,
      mappedTableIds: [1, 3],
      columns: [{ name: "Revenue", displayName: "Revenue", jsType: "number" }],
      dimensions: {
        orders: {
          createdAt: {
            type: "column",
            fieldId: 103,
            tableId: 1,
            name: "CREATED_AT",
            displayName: "Created At",
            jsType: "Date",
            baseType: "type/DateTime",
          },
          status: {
            type: "column",
            fieldId: 101,
            tableId: 1,
            name: "STATUS",
            displayName: "Status",
            jsType: "string",
          },
          amount: {
            type: "column",
            fieldId: 102,
            tableId: 1,
            name: "AMOUNT",
            displayName: "Amount",
            jsType: "number",
          },
        },
        franchises: {
          name: {
            type: "column",
            fieldId: 301,
            tableId: 3,
            sourceFieldId: 106,
            name: "NAME",
            displayName: "Name",
            jsType: "string",
          },
        },
      },
    },
    revenueFromModel: {
      id: 32,
      databaseId: 1,
      sourceCardId: 98,
      mappedTableIds: [1],
      columns: [{ name: "Revenue", displayName: "Revenue", jsType: "number" }],
      dimensions: {
        orders: {
          status: {
            type: "column",
            fieldId: 101,
            tableId: 1,
            name: "STATUS",
            displayName: "Status",
            jsType: "string",
          },
        },
      },
    },
  },
} as const;

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];
type RevenueMetric = (typeof TEST_SCHEMA)["metrics"]["revenue"];

const _validTableQuery = {
  source: TEST_SCHEMA.tables.orders,
  fields: [
    TEST_SCHEMA.tables.orders.fields.id,
    TEST_SCHEMA.tables.orders.fields.status,
  ],
  filters: [
    TEST_SCHEMA.tables.orders.segments.completed,
    filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
  ],
  aggregations: [
    TEST_SCHEMA.tables.orders.measures.revenue,
    sum(TEST_SCHEMA.tables.orders.fields.amount),
  ],
  breakouts: [
    breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
  ],
  orderBys: [
    orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, {
      direction: "desc",
      unit: "month",
    }),
  ],
  limit: 100,
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableSegmentQuery = {
  source: TEST_SCHEMA.tables.orders,
  filters: [
    // @ts-expect-error segments must belong to the source table
    TEST_SCHEMA.tables.products.segments.active,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableMeasureQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error measures must belong to the source table
    TEST_SCHEMA.tables.products.measures.price,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableFieldQuery = {
  source: TEST_SCHEMA.tables.orders,
  fields: [
    // @ts-expect-error fields must belong to the source table
    TEST_SCHEMA.tables.products.fields.price,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validMetricQuery = {
  source: TEST_SCHEMA.metrics.revenue,
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _validMetricQueryWithLimit = {
  source: TEST_SCHEMA.metrics.revenue,
  limit: 10,
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _validMetricQueryWithMeasure = {
  source: TEST_SCHEMA.metrics.revenue,
  aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _validMetricQueryWithAggregationHelpers = {
  source: TEST_SCHEMA.metrics.revenue,
  aggregations: [
    count(),
    sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
  ],
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _validMetricQueryWithFiltersAndBreakouts = {
  source: TEST_SCHEMA.metrics.revenue,
  filters: [
    TEST_SCHEMA.tables.orders.segments.completed,
    filter(TEST_SCHEMA.metrics.revenue.dimensions.orders.status, "=", "paid"),
  ],
  breakouts: [
    breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
      unit: "month",
    }),
  ],
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _validMetricQueryWithMappedTableBreakout = {
  source: TEST_SCHEMA.metrics.revenue,
  breakouts: [breakout(TEST_SCHEMA.metrics.revenue.dimensions.franchises.name)],
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _validSourceCardMetricQuery = {
  source: TEST_SCHEMA.metrics.revenueFromModel,
  filters: [
    filter(
      TEST_SCHEMA.metrics.revenueFromModel.dimensions.orders.status,
      "=",
      "paid",
    ),
  ],
} satisfies MetabaseQueryOptions<
  (typeof TEST_SCHEMA)["metrics"]["revenueFromModel"]
>;

const _invalidMetricQueryWithCrossTableMeasure = {
  source: TEST_SCHEMA.metrics.revenue,
  aggregations: [
    // @ts-expect-error measures must belong to the metric source table
    TEST_SCHEMA.tables.products.measures.price,
  ],
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _invalidMetricQueryWithCrossTableSegment = {
  source: TEST_SCHEMA.metrics.revenue,
  filters: [
    // @ts-expect-error segments must belong to one of the metric's mapped tables
    TEST_SCHEMA.tables.products.segments.active,
  ],
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _invalidMetricQueryWithNonDimensionFilter = {
  source: TEST_SCHEMA.metrics.revenue,
  filters: [
    // @ts-expect-error filters must use generated Metric dimensions
    filter(TEST_SCHEMA.tables.orders.fields.internalCode, "=", "secret"),
  ],
} satisfies MetabaseQueryOptions<RevenueMetric>;

const _invalidMetricQueryWithNonDimensionAggregationHelper = {
  source: TEST_SCHEMA.metrics.revenue,
  aggregations: [
    // @ts-expect-error aggregation helpers must use generated Metric dimensions
    sum(TEST_SCHEMA.tables.orders.fields.internalCode),
  ],
} satisfies MetabaseQueryOptions<RevenueMetric>;

function TypeFixtures() {
  useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    fields: [TEST_SCHEMA.tables.orders.fields.id],
  });

  // @ts-expect-error grouped queries must include an explicit aggregation
  useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    breakouts: [
      breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
    ],
  });

  const metricResult = useMetabaseQuery({
    source: TEST_SCHEMA.metrics.revenue,
    aggregations: [
      TEST_SCHEMA.tables.orders.measures.revenue,
      count(),
      sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
    ],
  });

  metricResult.data?.rows.forEach((row) => {
    const revenue: number | null = row.Revenue;
    const sum: number | null = row.sum;
    const count: number | null = row.count;

    return { revenue, sum, count };
  });

  return null;
}

void TypeFixtures;

describe("createMetabaseQuery", () => {
  it("lowers the public source DSL through Lib.createTestQuery", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.tables.orders,
      fields: [
        TEST_SCHEMA.tables.orders.fields.id,
        TEST_SCHEMA.tables.orders.fields.status,
      ],
      filters: [
        TEST_SCHEMA.tables.orders.segments.completed,
        filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
      ],
      aggregations: [count(), sum(TEST_SCHEMA.tables.orders.fields.amount)],
      breakouts: [
        breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
      ],
      orderBys: [
        orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, {
          direction: "desc",
          unit: "month",
        }),
      ],
      limit: 100,
    });

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          fields: [
            ["field", expect.anything(), 100],
            ["field", expect.anything(), 101],
          ],
          filters: [
            ["segment", expect.anything(), 11],
            ["=", expect.anything(), ["field", expect.anything(), 101], "paid"],
          ],
          aggregation: [
            ["count", expect.anything()],
            ["sum", expect.anything(), ["field", expect.anything(), 102]],
          ],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              103,
            ],
          ],
          "order-by": [
            [
              "desc",
              expect.anything(),
              [
                "field",
                expect.objectContaining({ "temporal-unit": "month" }),
                103,
              ],
            ],
          ],
          limit: 100,
        },
      ],
    });
  });

  it("lowers generated Metric sources through Lib.createTestQuery", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.metrics.revenue,
    });

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
        },
      ],
    });
  });

  it("adds limits to generated Metric sources", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.metrics.revenue,
      limit: 10,
    });

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
          limit: 10,
        },
      ],
    });
  });

  it("adds compatible saved Measures to generated Metric sources", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.metrics.revenue,
      aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
    });

    expect(
      (datasetQuery as DatasetQuery & { stages: any[] }).stages[0].aggregation,
    ).toEqual([
      ["metric", expect.anything(), 31],
      ["measure", expect.anything(), 21],
    ]);
  });

  it("adds aggregation helpers to generated Metric sources", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.metrics.revenue,
      aggregations: [
        count(),
        sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
      ],
    });

    expect(
      (datasetQuery as DatasetQuery & { stages: any[] }).stages[0].aggregation,
    ).toEqual([
      ["metric", expect.anything(), 31],
      ["count", expect.anything()],
      ["sum", expect.anything(), ["field", expect.anything(), 102]],
    ]);
  });

  it("adds filters and breakouts to generated Metric sources", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.metrics.revenue,
      filters: [
        TEST_SCHEMA.tables.orders.segments.completed,
        filter(
          TEST_SCHEMA.metrics.revenue.dimensions.orders.status,
          "=",
          "paid",
        ),
      ],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
          unit: "month",
        }),
      ],
    });

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
          filters: [
            ["segment", expect.anything(), 11],
            ["=", expect.anything(), ["field", expect.anything(), 101], "paid"],
          ],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              103,
            ],
          ],
        },
      ],
    });
  });

  it("adds mapped-table dimension breakouts to generated Metric sources", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.metrics.revenue,
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.franchises.name),
      ],
    });

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
          breakout: [["field", expect.anything(), 301]],
        },
      ],
    });
  });

  it("lowers source-card Metric sources through Lib.createTestQuery", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.metrics.revenueFromModel,
      filters: [
        filter(
          TEST_SCHEMA.metrics.revenueFromModel.dimensions.orders.status,
          "=",
          "paid",
        ),
      ],
    });

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          aggregation: [["metric", expect.anything(), 32]],
          filters: [
            [
              "=",
              expect.anything(),
              ["field", expect.anything(), "STATUS"],
              "paid",
            ],
          ],
        },
      ],
    });
  });

  it("lowers saved Measures to Lib.createTestQuery measure aggregations", () => {
    const datasetQuery = createMetabaseQueryInBundle({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
    });

    expect(
      (datasetQuery as DatasetQuery & { stages: any[] }).stages[0].aggregation,
    ).toEqual([["measure", expect.anything(), 21]]);
  });

  it("rejects invalid limits before calling Lib.createTestQuery", () => {
    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.tables.orders,
        limit: 0,
      }),
    ).toThrow("Table query limit must be a positive integer.");
  });

  it("rejects invalid Metric limits before calling Lib.createTestQuery", () => {
    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.metrics.revenue,
        limit: 0,
      }),
    ).toThrow("Metric query limit must be a positive integer.");
  });

  it("rejects Metric source Measures from a different table", () => {
    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.metrics.revenue,
        aggregations: [TEST_SCHEMA.tables.products.measures.price],
      }),
    ).toThrow(
      "Metric query aggregations must belong to one of the Metric's mapped tables.",
    );
  });

  it("rejects Metric source aggregation helpers that do not use generated Metric dimensions", () => {
    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.metrics.revenue,
        aggregations: [
          sum(TEST_SCHEMA.tables.orders.fields.internalCode as any),
        ],
      }),
    ).toThrow(
      "Metric query aggregations must use generated Metric dimensions.",
    );
  });

  it("rejects Metric source filters that are not generated Metric dimensions", () => {
    expect(() =>
      createMetabaseQueryInBundle({
        source: TEST_SCHEMA.metrics.revenue,
        filters: [
          filter(TEST_SCHEMA.tables.orders.fields.internalCode, "=", "secret"),
        ],
      }),
    ).toThrow("Metric query filters must use generated Metric dimensions.");
  });
});
