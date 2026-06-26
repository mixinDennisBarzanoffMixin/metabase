import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { createMetabaseQueryFromMetadata } from "metabase/embedding-sdk/lib/create-metabase-query";
import { fetchCardQueryMetadata } from "metabase/redux/cards";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadata } from "metabase/selectors/metadata";

import { createMetabaseQuery } from "./create-metabase-query";

jest.mock("metabase/embedding-sdk/lib/create-metabase-query", () => ({
  createMetabaseQueryFromMetadata: jest.fn(),
}));

jest.mock("metabase/redux/cards", () => ({
  fetchCardQueryMetadata: jest.fn(),
}));

jest.mock("metabase/redux/tables", () => ({
  fetchTableMetadata: jest.fn(),
}));

jest.mock("metabase/selectors/metadata", () => ({
  getMetadata: jest.fn(),
}));

const createMetabaseQueryFromMetadataMock =
  createMetabaseQueryFromMetadata as jest.Mock;

const fetchCardQueryMetadataMock =
  fetchCardQueryMetadata as unknown as jest.Mock;
const fetchTableMetadataMock = fetchTableMetadata as unknown as jest.Mock;
const getMetadataMock = getMetadata as unknown as jest.Mock;

const STATE = {};
const METADATA = {};
const FETCH_CARD_QUERY_METADATA_ACTION = {};
const FETCH_TABLE_METADATA_ACTION = {};
const DATASET_QUERY = {
  type: "query",
  database: 1,
  query: { "source-table": 1 },
};

const TABLE_QUERY = {
  table: {
    id: 1,
    databaseId: 1,
  },
};

const TABLE_ID_QUERY = {
  tableId: 1,
};

const METRIC_QUERY = {
  metricId: 34,
};

const createMockStore = () =>
  ({
    dispatch: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn(() => STATE),
  }) as unknown as SdkStore;

describe("createMetabaseQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    fetchCardQueryMetadataMock.mockReturnValue(
      FETCH_CARD_QUERY_METADATA_ACTION,
    );
    fetchTableMetadataMock.mockReturnValue(FETCH_TABLE_METADATA_ACTION);
    getMetadataMock.mockReturnValue(METADATA);
    createMetabaseQueryFromMetadataMock.mockReturnValue(DATASET_QUERY);
  });

  it("loads table query metadata before building a table dataset query", async () => {
    const store = createMockStore();

    const result = await createMetabaseQuery(store)({
      query: TABLE_QUERY,
    });

    expect(fetchTableMetadata).toHaveBeenCalledWith(
      { id: 1 },
      { reload: false },
    );

    expect(store.dispatch).toHaveBeenCalledWith(FETCH_TABLE_METADATA_ACTION);
    expect(getMetadata).toHaveBeenCalledWith(STATE);

    expect(createMetabaseQueryFromMetadata).toHaveBeenCalledWith(
      TABLE_QUERY,
      METADATA,
    );

    expect(result).toBe(DATASET_QUERY);
  });

  it("loads table query metadata for tableId queries", async () => {
    const store = createMockStore();

    const result = await createMetabaseQuery(store)({
      query: TABLE_ID_QUERY,
    });

    expect(fetchTableMetadata).toHaveBeenCalledWith(
      { id: 1 },
      { reload: false },
    );

    expect(createMetabaseQueryFromMetadata).toHaveBeenCalledWith(
      TABLE_ID_QUERY,
      METADATA,
    );

    expect(result).toBe(DATASET_QUERY);
  });

  it("reloads table query metadata when requested", async () => {
    const store = createMockStore();

    await createMetabaseQuery(store)({
      query: TABLE_QUERY,
      reloadMetadata: true,
    });

    expect(fetchTableMetadata).toHaveBeenCalledWith(
      { id: 1 },
      { reload: true },
    );
  });

  it("loads metric query metadata before building a metric dataset query", async () => {
    const store = createMockStore();

    const result = await createMetabaseQuery(store)({
      query: METRIC_QUERY,
    });

    expect(fetchTableMetadata).not.toHaveBeenCalled();
    expect(fetchCardQueryMetadata).toHaveBeenCalledWith(
      { id: 34 },
      { reload: false },
    );

    expect(store.dispatch).toHaveBeenCalledWith(
      FETCH_CARD_QUERY_METADATA_ACTION,
    );
    expect(getMetadata).toHaveBeenCalledWith(STATE);

    expect(createMetabaseQueryFromMetadata).toHaveBeenCalledWith(
      METRIC_QUERY,
      METADATA,
    );

    expect(result).toBe(DATASET_QUERY);
  });

  it("reloads metric query metadata when requested", async () => {
    const store = createMockStore();

    await createMetabaseQuery(store)({
      query: METRIC_QUERY,
      reloadMetadata: true,
    });

    expect(fetchCardQueryMetadata).toHaveBeenCalledWith(
      { id: 34 },
      { reload: true },
    );
  });
});
