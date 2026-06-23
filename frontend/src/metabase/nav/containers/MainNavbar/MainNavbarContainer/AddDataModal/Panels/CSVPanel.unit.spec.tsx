import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { StorageSetupProvider } from "metabase/common/components/upsells/StoragePurchaseModal";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { CSVPanel } from "./CSVPanel";

const renderPanel = (mounted: boolean) =>
  mounted ? (
    <CSVPanel
      canUpload={false}
      canManageUploads
      uploadsEnabled={false}
      onCloseAddDataModal={jest.fn()}
    />
  ) : null;

const setup = () => {
  const settingValues = {
    "is-hosted?": true,
    "store-url": "https://store.metabase.com",
    "token-features": createMockTokenFeatures({}),
  };

  setupPropertiesEndpoints(createMockSettings(settingValues));
  setupDatabaseListEndpoint([]);
  fetchMock.get("path:/api/ee/cloud-add-ons/addons", [mockStorageCloudAddOn]);
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);
  fetchMock.post("path:/api/premium-features/token/refresh", {});

  const { rerender } = renderWithProviders(
    <StorageSetupProvider>{renderPanel(true)}</StorageSetupProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settingValues),
      }),
    },
  );

  const remount = (mounted: boolean) =>
    rerender(
      <StorageSetupProvider>{renderPanel(mounted)}</StorageSetupProvider>,
    );

  return { remount };
};

describe("CSVPanel storage setup", () => {
  it("shows the in-panel setting-up view after triggering the purchase", async () => {
    setup();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/dwh-rent", {
          method: "POST",
        }),
      ).toBe(true);
    });
  });

  it("keeps the setting-up state when the panel is unmounted and remounted", async () => {
    const { remount } = setup();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    // Simulate closing the Add data modal (panel content unmounts) and reopening
    // it. The provider lives above the modal, so the setting-up state survives.
    remount(false);
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();

    remount(true);
    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
  });
});
