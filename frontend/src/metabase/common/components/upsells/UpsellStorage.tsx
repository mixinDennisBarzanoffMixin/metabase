import { t } from "ttag";

import {
  useHasTokenFeature,
  useSetting,
  useStoreUrl,
} from "metabase/common/hooks";
import { Center, List, Loader, Text } from "metabase/ui";

import { useStorageAddOn, useStorageSetup } from "./StoragePurchaseModal";
import { UpsellBanner } from "./components";

export const UpsellStorage = ({ location }: { location: string }) => {
  const campaign = "storage";
  /**
   * @link https://linear.app/metabase/issue/CLO-4190/create-url-for-buy-storage-page-without-purchase-id
   */
  const storeUrl = useStoreUrl("account/storage");

  const isHosted = useSetting("is-hosted?");
  const hasStorage = useHasTokenFeature("attached_dwh");
  const { storageAddOn, isLoading } = useStorageAddOn();
  const { handlePurchase } = useStorageSetup();

  if (!isHosted || hasStorage) {
    return null;
  }

  if (isLoading) {
    return (
      <Center py="md">
        <Loader data-testid="upsell-storage-loader" />
      </Center>
    );
  }

  // When the Storage add-on is purchasable in-app the "Add" button triggers the
  // purchase directly; otherwise we fall back to linking out to the store.
  const canPurchaseInApp = storageAddOn != null;

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Add`}
      buttonLink={storeUrl}
      onClick={canPurchaseInApp ? handlePurchase : undefined}
      location={location}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins
      title={t`Add Metabase Storage`}
      large
    >
      <List
        mt="xs"
        withPadding
        size="sm"
        styles={{
          root: { paddingInlineStart: "var(--mantine-spacing-sm)" },
        }}
      >
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Storage, only visible to admins */}
        <List.Item>{t`Secure, fully managed by Metabase`}</List.Item>
        <List.Item>{t`Upload CSV files`}</List.Item>
        <List.Item>{t`Sync with Google Sheets`}</List.Item>
      </List>

      {canPurchaseInApp && (
        <Text component="span" display="block" mt="sm" size="sm">
          {t`By clicking Add, you agree to be charged in accordance with our terms of service. You will not be charged until you reach 1M stored rows.`}
        </Text>
      )}
    </UpsellBanner>
  );
};
