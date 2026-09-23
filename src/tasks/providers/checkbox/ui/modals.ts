import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditCheckboxProviderModal from "./EditCheckboxProviderModal.vue";

export const editCheckboxProviderModal = defineModal()({
  component: EditCheckboxProviderModal,
  title: () => m.tasks_settings_provider_checkbox(),
  width: 720,
});
