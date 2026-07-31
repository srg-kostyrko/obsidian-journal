import type { DecorationOwner, JournalDecoration, JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DeleteDecorationModal from "./DeleteDecorationModal.vue";
import EditDecorationModal from "./EditDecorationModal.vue";

export interface EditDecorationModalProps {
  decoration?: JournalDecoration;
  conditionTypes: readonly JournalDecorationCondition["type"][];
}

export const editDecorationModal = defineModal<{ decoration: JournalDecoration }>()({
  component: EditDecorationModal,
  title: ({ decoration }: EditDecorationModalProps) => (decoration ? m.decoration_edit() : m.decoration_add()),
  width: 800,
});

export const deleteDecorationModal = defineModal<{ confirmed: true }>()({
  component: DeleteDecorationModal,
  title: (_: { owner: DecorationOwner }) => m.decoration_delete(),
});
