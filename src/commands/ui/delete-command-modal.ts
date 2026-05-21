import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DeleteCommandModal from "./DeleteCommandModal.vue";

import type { Component } from "vue";

export const deleteCommandModal: ModalDefinition<{ commandName: string }, void> = defineModal({
  component: DeleteCommandModal as Component,
  title: () => m.command_delete_modal_title(),
});
