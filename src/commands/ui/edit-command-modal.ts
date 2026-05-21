import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import EditCommandModal from "./EditCommandModal.vue";

import type { CommandConfig, CommandTarget } from "../config";
import type { Component } from "vue";

export interface EditCommandModalProps {
  command?: CommandConfig;
  target: CommandTarget;
  takenNames: string[];
}

export const editCommandModal: ModalDefinition<EditCommandModalProps, CommandConfig> = defineModal({
  component: EditCommandModal as Component,
  title: ({ command }: EditCommandModalProps) => (command ? m.command_edit_modal_title() : m.command_add_modal_title()),
});
