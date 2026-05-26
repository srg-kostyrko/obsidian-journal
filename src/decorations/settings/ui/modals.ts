import type { JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";
import type { JournalConfig } from "@/journals/config";

import DeleteDecorationModal from "./DeleteDecorationModal.vue";
import EditDecorationModal from "./EditDecorationModal.vue";

export interface EditDecorationModalProps {
  journalName: string;
  decoration?: JournalDecoration;
  writeType: JournalConfig["write"]["type"];
}

export const editDecorationModal = defineModal<{ decoration: JournalDecoration }>()({
  component: EditDecorationModal,
  title: ({ decoration }: EditDecorationModalProps) =>
    decoration ? m.decoration_edit_modal_title() : m.decoration_add_modal_title(),
  width: 800,
});

export const deleteDecorationModal = defineModal<{ confirmed: true }>()({
  component: DeleteDecorationModal,
  title: (_: { journalName: string }) => m.decoration_delete_modal_title(),
});
