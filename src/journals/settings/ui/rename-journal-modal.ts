import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import RenameJournalModal from "./RenameJournalModal.vue";

export const renameJournalModal: ModalDefinition<{ currentName: string }, { newName: string }> = defineModal({
  component: RenameJournalModal,
  title: ({ currentName }: { currentName: string }) => m.journal_rename_modal_title({ name: currentName }),
});
