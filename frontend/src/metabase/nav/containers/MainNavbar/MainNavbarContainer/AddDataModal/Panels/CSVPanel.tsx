import { t } from "ttag";

import {
  StorageSetupView,
  useStorageSetup,
} from "metabase/common/components/upsells/StoragePurchaseModal";
import { UpsellStorage } from "metabase/common/components/upsells/UpsellStorage";
import * as Urls from "metabase/urls";

import { CSVPanelEmptyState } from "./AddDataModalEmptyStates";
import { CSVUpload } from "./CSVUpload";

interface CSVPanelProps {
  canUpload: boolean;
  canManageUploads: boolean;
  onCloseAddDataModal: () => void;
  uploadsEnabled: boolean;
}

export const CSVPanel = ({
  canUpload,
  canManageUploads,
  onCloseAddDataModal,
  uploadsEnabled,
}: CSVPanelProps) => {
  const { isSettingUp } = useStorageSetup();

  const showObtainPermissionPrompt = uploadsEnabled && !canUpload;

  const showEnableUploadsCTA = !uploadsEnabled && canManageUploads;
  const showEnableUploadsPrompt = !uploadsEnabled && !canManageUploads;

  if (showEnableUploadsPrompt) {
    return <CSVPanelEmptyState contactAdminReason="enable-csv-upload" />;
  }

  if (showObtainPermissionPrompt) {
    return (
      <CSVPanelEmptyState contactAdminReason="obtain-csv-upload-permission" />
    );
  }

  if (isSettingUp) {
    return <StorageSetupView />;
  }

  if (showEnableUploadsCTA) {
    return (
      <CSVPanelEmptyState
        ctaLink={{
          text: t`Enable uploads`,
          to: Urls.uploadsSettings(),
        }}
        upsell={<UpsellStorage location="add-data-modal-csv" />}
      />
    );
  }

  return <CSVUpload onCloseAddDataModal={onCloseAddDataModal} />;
};
