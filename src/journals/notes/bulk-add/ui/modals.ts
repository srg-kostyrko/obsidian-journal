import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfigureBulkAddModal from "./ConfigureBulkAddModal.vue";
import ProcessBulkAddModal from "./ProcessBulkAddModal.vue";

import type { BulkPlan } from "../bulk-add-service";
import type { BulkAddParameters } from "../config";

export const configureBulkAddModal = defineModal<BulkAddParameters>()({
  component: ConfigureBulkAddModal,
  title: ({ journalName }: { journalName: string }) => m.bulk_add_configure_title({ journalName }),
  width: 700,
});

export const processBulkAddModal = defineModal()({
  component: ProcessBulkAddModal,
  title: ({ journalName }: { journalName: string; plan: BulkPlan; parameters: BulkAddParameters }) =>
    m.bulk_add_process_title({ journalName }),
  width: 700,
});
