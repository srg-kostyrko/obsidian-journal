import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DeleteCommandModal from "./DeleteCommandModal.vue";

export const deleteCommandModal: ModalDefinition<{ commandName: string }, void> = defineModal({
  component: DeleteCommandModal,
  title: () => m.command_delete_modal_title(),
});
