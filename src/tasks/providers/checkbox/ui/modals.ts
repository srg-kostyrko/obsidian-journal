import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditCheckboxProviderModal from "./EditCheckboxProviderModal.vue";
import EditJournalTasksModal from "./EditJournalTasksModal.vue";

export const editCheckboxProviderModal = defineModal()({
  component: EditCheckboxProviderModal,
  title: () => m.tasks_settings_provider_checkbox(),
  width: 720,
});

export interface EditJournalTasksModalProps {
  journalName: string;
}

export const editJournalTasksModal = defineModal()({
  component: EditJournalTasksModal,
  title: ({ journalName }: EditJournalTasksModalProps) => m.tasks_journal_modal_title({ journal: journalName }),
  width: 720,
});
