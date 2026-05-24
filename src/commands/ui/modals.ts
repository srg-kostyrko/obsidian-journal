import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DeleteCommandModal from "./DeleteCommandModal.vue";
import EditCommandModal from "./EditCommandModal.vue";

import type { CommandConfig, CommandTarget } from "../config";

export const deleteCommandModal = defineModal()({
  component: DeleteCommandModal,
  title: (_: { commandName: string }) => m.command_delete_modal_title(),
});

export interface EditCommandModalProps {
  command?: CommandConfig;
  target: CommandTarget;
  takenNames: string[];
}

export const editCommandModal = defineModal<CommandConfig>()({
  component: EditCommandModal,
  title: ({ command }: EditCommandModalProps) => (command ? m.command_edit_modal_title() : m.command_add_modal_title()),
});
