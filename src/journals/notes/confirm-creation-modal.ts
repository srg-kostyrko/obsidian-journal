import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfirmCreationModal from "./ConfirmCreationModal.vue";

export const confirmCreationModal = defineModal<{ journalName: string; noteName: string }, boolean>({
  component: ConfirmCreationModal,
  title: () => m.confirm_note_creation_title(),
});
