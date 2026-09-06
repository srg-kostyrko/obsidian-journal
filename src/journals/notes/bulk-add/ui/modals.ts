import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfigureBulkAddModal from "./ConfigureBulkAddModal.vue";
import ConfigureBulkAddNoteletsModal from "./ConfigureBulkAddNoteletsModal.vue";
import ProcessBulkAddModal from "./ProcessBulkAddModal.vue";

import type { BulkPlan } from "../bulk-add-service";
import type { BulkAddParameters } from "../config";

export const configureBulkAddModal = defineModal<BulkAddParameters>()({
  component: ConfigureBulkAddModal,
  title: ({ journalName }: { journalName: string }) => m.bulk_add_notes_to_title({ journalName }),
  width: 700,
});

export const configureBulkAddNoteletsModal = defineModal<BulkAddParameters>()({
  component: ConfigureBulkAddNoteletsModal,
  title: ({ typeName }: { journalName: string; typeId: string; typeName: string }) =>
    m.bulk_add_notelets_to_title({ type: typeName }),
  width: 700,
});

export const processBulkAddModal = defineModal()({
  component: ProcessBulkAddModal,
  title: ({ journalName }: { journalName: string; plan: BulkPlan; parameters: BulkAddParameters }) =>
    m.bulk_add_notes_to_title({ journalName }),
  width: 700,
});
