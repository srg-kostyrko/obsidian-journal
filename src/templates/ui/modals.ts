import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DateModificationsModal from "./DateModificationsModal.vue";

export const dateModificationsModal = defineModal()({
  component: DateModificationsModal,
  title: () => m.variable_modifications_modal_title(),
});
