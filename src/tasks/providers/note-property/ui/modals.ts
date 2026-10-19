import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditJournalTaskNotesModal from "./EditJournalTaskNotesModal.vue";
import EditNotePropertyProviderModal from "./EditNotePropertyProviderModal.vue";

export const editNotePropertyProviderModal = defineModal()({
  component: EditNotePropertyProviderModal,
  title: () => m.tasks_settings_provider_note_property(),
  width: 720,
});

export interface EditJournalTaskNotesModalProps {
  journalName: string;
}

export const editJournalTaskNotesModal = defineModal()({
  component: EditJournalTaskNotesModal,
  title: ({ journalName }: EditJournalTaskNotesModalProps) =>
    m.tasks_note_visibility_modal_title({ journal: journalName }),
  width: 720,
});
