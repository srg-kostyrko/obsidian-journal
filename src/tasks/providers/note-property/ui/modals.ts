import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditNotePropertyProviderModal from "./EditNotePropertyProviderModal.vue";

export const editNotePropertyProviderModal = defineModal()({
  component: EditNotePropertyProviderModal,
  title: () => m.tasks_settings_provider_note_property(),
  width: 720,
});
