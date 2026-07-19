import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  MetabaseWorkspaceDriver,
  VeritlyContext,
} from "metabase/veritly/flush";
import type { Engine } from "metabase-types/api";
import { createMockEngine } from "metabase-types/api/mocks";

import { VeritlySourcePage } from "./VeritlySourcePage";

const engines: Record<string, Engine> = {
  postgres: createMockEngine({
    "driver-name": "PostgreSQL",
    "details-fields": [{ name: "veritly-tunnel-enabled", type: "hidden" }],
  }),
  snowflake: createMockEngine({
    "driver-name": "Snowflake",
    "details-fields": [{ name: "account", type: "string" }],
  }),
};

class Events {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  close() {
    return undefined;
  }
}

function setup() {
  fetchMock.get("path:/connector", { connectors: [] });
  fetchMock.get("path:/connector/source/019f7aa8-72a1-7c53-8c3e-88a5ff7b733d", {
    source: { id: "019f7aa8-72a1-7c53-8c3e-88a5ff7b733d" },
  });
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: Events,
  });
  window.history.replaceState(
    {},
    "",
    "/veritly/source/new?name=Orders#veritlyApi=https%3A%2F%2Fapi.veritly.co.uk&veritlySource=019f7aa8-72a1-7c53-8c3e-88a5ff7b733d",
  );
  const driver = new MetabaseWorkspaceDriver({ push: () => undefined });
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <VeritlyContext.Provider value={driver}>
          <VeritlySourcePage params={{}} route={{} as Route} />
        </VeritlyContext.Provider>
      )}
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        settings: mockSettings({ engines }),
      }),
    },
  );
  return driver;
}

describe("VeritlySourcePage", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
  });

  it("shows the tunnel step only after selecting a capable driver", async () => {
    const driver = setup();

    expect(
      screen.getByRole("heading", { name: "Choose your database" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "PostgreSQL" }));

    expect(
      await screen.findByRole("heading", {
        name: "Connect to the private database",
      }),
    ).toBeInTheDocument();
    driver.dispose();
  });

  it("opens the native database form directly for Snowflake", async () => {
    const driver = setup();

    await userEvent.click(screen.getByRole("option", { name: "Snowflake" }));

    expect(screen.queryByTestId("database-tunnel")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Database type")).toHaveValue(
      "Snowflake",
    );
    driver.dispose();
  });
});
