import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
} from "metabase-types/api/mocks";

import { StorageSetupProvider, useStorageSetup } from "./storage-setup-context";

const TestConsumer = () => {
  const { isSettingUp, isReady, handlePurchase } = useStorageSetup();

  return (
    <div>
      <button onClick={handlePurchase}>Add storage</button>
      {isSettingUp && <span>setting up</span>}
      {isReady && <span>ready</span>}
    </div>
  );
};

interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  uploadDbId?: number | null;
}

const setup = ({ tokenFeatures = {}, uploadDbId = null }: SetupOpts = {}) => {
  const settingValues = {
    "token-features": createMockTokenFeatures(tokenFeatures),
    "uploads-settings": {
      db_id: uploadDbId,
      schema_name: null,
      table_prefix: null,
    },
  };

  setupPropertiesEndpoints(
    createMockSettings({
      ...settingValues,
      "token-status": createMockTokenStatus({
        features: tokenFeatures.attached_dwh ? ["attached-dwh"] : [],
      }),
    }),
  );
  // Storage is only "ready" once the upload database actually surfaces in the
  // databases list and accepts uploads, so seed it when an upload db is expected.
  setupDatabaseListEndpoint(
    uploadDbId != null
      ? [createMockDatabase({ id: uploadDbId, can_upload: true })]
      : [],
  );
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);
  fetchMock.post(
    "path:/api/premium-features/token/refresh",
    createMockTokenStatus(),
  );

  renderWithProviders(
    <StorageSetupProvider>
      <TestConsumer />
    </StorageSetupProvider>,
    {
      storeInitialState: createMockState({
        settings: mockSettings(settingValues),
      }),
    },
  );
};

const clickAddStorage = () =>
  userEvent.click(screen.getByRole("button", { name: "Add storage" }));

describe("StorageSetupProvider", () => {
  it("purchases the add-on and enters the setting-up state", async () => {
    setup();

    await clickAddStorage();

    expect(await screen.findByText("setting up")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/dwh-rent", {
          method: "POST",
        }),
      ).toBe(true);
    });
  });

  it("reloads the databases list while setting up", async () => {
    setup();

    await clickAddStorage();

    expect(await screen.findByText("setting up")).toBeInTheDocument();

    // The hook polls the databases list (in addition to settings) so the
    // surrounding panels can react without a page reload.
    await waitFor(
      () => {
        expect(
          fetchMock.callHistory.calls("path:/api/database").length,
        ).toBeGreaterThan(1);
      },
      { timeout: 3000 },
    );
  });

  it("stays in the setting-up state while the upload database is missing", async () => {
    setup({ tokenFeatures: { attached_dwh: true } });

    await clickAddStorage();

    expect(await screen.findByText("setting up")).toBeInTheDocument();
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
  });

  it("leaves the setting-up state once storage is attached and the upload database is available", async () => {
    setup({
      tokenFeatures: { attached_dwh: true },
      uploadDbId: 1,
    });

    await clickAddStorage();

    // Once storage is ready the provider resets back to `initial`, so the
    // setting-up flag clears and hosting panels reveal their default view.
    await waitFor(() => {
      expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    });
  });
});
