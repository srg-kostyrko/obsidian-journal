import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DeleteJournalModal from "./DeleteJournalModal.vue";

export const deleteJournalModal: ModalDefinition<{ journalName: string }, { mode: "keep" }> = defineModal({
  component: DeleteJournalModal,
  title: ({ journalName }: { journalName: string }) => m.journal_delete_modal_title({ name: journalName }),
});
