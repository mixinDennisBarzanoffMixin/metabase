import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  createMetabaseQuery as createMetabaseQueryFromGeneratedSchema,
  createMetabaseQueryFromMetadata,
} from "metabase/embedding-sdk/lib/create-metabase-query";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadata } from "metabase/selectors/metadata";

import { createMetabaseQuery } from "./create-metabase-query";

jest.mock("metabase/embedding-sdk/lib/create-metabase-query", () => ({
  createMetabaseQuery: jest.fn(),
  createMetabaseQueryFromMetadata: jest.fn(),
}));

jest.mock("metabase/redux/tables", () => ({
  fetchTableMetadata: jest.fn(),
}));

jest.mock("metabase/selectors/metadata", () => ({
  getMetadata: jest.fn(),
}));

const createMetabaseQueryFromGeneratedSchemaMock =
  createMetabaseQueryFromGeneratedSchema as jest.Mock;

const createMetabaseQueryFromMetadataMock =
  createMetabaseQueryFromMetadata as jest.Mock;

const fetchTableMetadataMock = fetchTableMetadata as unknown as jest.Mock;
const getMetadataMock = getMetadata as unknown as jest.Mock;

const STATE = {};
const METADATA = {};
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

const createMockStore = () =>
  ({
    dispatch: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn(() => STATE),
  }) as unknown as SdkStore;

describe("createMetabaseQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    fetchTableMetadataMock.mockReturnValue(FETCH_TABLE_METADATA_ACTION);
    getMetadataMock.mockReturnValue(METADATA);
    createMetabaseQueryFromMetadataMock.mockReturnValue(DATASET_QUERY);
    createMetabaseQueryFromGeneratedSchemaMock.mockReturnValue(DATASET_QUERY);
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

  it("keeps non-table queries on the existing builder path", async () => {
    const store = createMockStore();
    const metricQuery = { metricId: 34 };

    const result = await createMetabaseQuery(store)({
      query: metricQuery,
    });

    expect(fetchTableMetadata).not.toHaveBeenCalled();

    expect(createMetabaseQueryFromGeneratedSchema).toHaveBeenCalledWith(
      metricQuery,
    );

    expect(result).toBe(DATASET_QUERY);
  });
});
