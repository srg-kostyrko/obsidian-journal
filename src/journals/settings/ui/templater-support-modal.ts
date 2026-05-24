import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import TemplaterSupportModal from "./TemplaterSupportModal.vue";

export const templaterSupportModal: ModalDefinition<Record<string, never>, void> = defineModal({
  component: TemplaterSupportModal,
  title: () => m.templater_support_modal_title(),
});
