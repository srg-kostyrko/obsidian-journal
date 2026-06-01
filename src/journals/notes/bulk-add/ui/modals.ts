import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfigureBulkAddModal from "./ConfigureBulkAddModal.vue";

import type { BulkAddParameters } from "../config";

export const configureBulkAddModal = defineModal<BulkAddParameters>()({
  component: ConfigureBulkAddModal,
  title: ({ journalName }: { journalName: string }) => m.bulk_add_configure_title({ journalName }),
  width: 700,
});
