import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ImportConnectModal from "./ImportConnectModal.vue";
import ImportPreviewModal from "./ImportPreviewModal.vue";

import type { ImportSelection } from "../import-service";

export const importPreviewModal = defineModal<ImportSelection>()({
  component: ImportPreviewModal,
  title: () => m.import_preview_title(),
  width: 700,
});

export const importConnectModal = defineModal()({
  component: ImportConnectModal,
  title: () => m.import_connect_title(),
  width: 700,
});
