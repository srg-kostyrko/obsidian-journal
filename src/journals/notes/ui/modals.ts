import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfirmCreationModal from "./ConfirmCreationModal.vue";

export const confirmCreationModal = defineModal<boolean>()({
  component: ConfirmCreationModal,
  title: (_: { journalName: string; noteName: string }) => m.confirm_note_creation_title(),
});
