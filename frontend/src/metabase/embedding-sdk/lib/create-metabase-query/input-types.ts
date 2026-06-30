import type {
  FieldSchema,
  MeasureSchema,
  SchemaColumn,
  SegmentSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { FilterOperator as LibFilterOperator } from "metabase-lib/common";
import type { BinningOptions } from "metabase-lib/query";
import type { TemporalUnit } from "metabase-types/api";

type ID = string | number;

export type FilterOperator =
  | Exclude<LibFilterOperator, "inside">
  | "time-interval";

export type SqlParameterValuesInput = Record<
  string,
  | string
  | number
  | boolean
  | readonly (string | number | boolean | null)[]
  | null
  | undefined
>;

export type QuestionQueryInput = {
  questionId: ID;
  parameters?: SqlParameterValuesInput;
  enabled?: boolean;
};

export type TableQueryInput = {
  source: TableSchema;
  questionId?: never;
  filters?: readonly FilterInput[];
  fields?: readonly FieldSchema[];
  aggregations?: readonly AggregationInput[];
  breakouts?: readonly BreakoutInput[];
  orderBys?: readonly OrderByInput[];
  limit?: number;
  enabled?: boolean;
};

export type MetabaseQueryInput = QuestionQueryInput | TableQueryInput;

export type SegmentReferenceInput = Pick<SegmentSchema, "type" | "id"> & {
  tableId?: number;
};

export type MeasureReferenceInput = Pick<MeasureSchema, "type" | "id"> & {
  tableId?: number;
  columns?: readonly SchemaColumn[];
};

export type CountAggregationInput = {
  type: "count";
};

export type FieldAggregationInput<TDimension = FieldSchema> = {
  type: "sum" | "avg" | "median" | "distinct" | "min" | "max";
  dimension: TDimension;
  columns?: readonly SchemaColumn[];
};

export type AggregationInput =
  | CountAggregationInput
  | FieldAggregationInput
  | MeasureReferenceInput;

export type DimensionFilterInput<TDimension = FieldSchema> = {
  dimension: TDimension;
  operator: FilterOperator;
  value?: unknown;
  values?: readonly unknown[];
};

export type FilterInput = DimensionFilterInput | SegmentReferenceInput;

export type BreakoutInput<TDimension = FieldSchema> =
  | TDimension
  | ({
      dimension: TDimension;
      unit?: TemporalUnit;
      binning?: BinningOptions;
    } & Partial<ColumnBinningInput>);

export type OrderByInput<TDimension = FieldSchema> = {
  type: "column";
  name: string;
  direction?: "asc" | "desc";
  unit?: TemporalUnit;
  bins?: number | "auto";
  binWidth?: number | "auto";
  dimension?: TDimension;
};

export type ColumnBinningInput =
  | { bins?: number | "auto"; binWidth?: never }
  | { binWidth?: number | "auto"; bins?: never };
