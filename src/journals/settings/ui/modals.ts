import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import AddJournalModal from "./AddJournalModal.vue";
import CodeBlockReferenceModal from "./CodeBlockReferenceModal.vue";
import DateModificationsModal from "./DateModificationsModal.vue";
import DeleteJournalModal from "./DeleteJournalModal.vue";
import EditFrontmatterFieldModal from "./EditFrontmatterFieldModal.vue";
import EditSequencePropertyModal from "./EditSequencePropertyModal.vue";
import RenameJournalModal from "./RenameJournalModal.vue";
import TemplaterSupportModal from "./TemplaterSupportModal.vue";
import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";
import type { JournalWrite } from "../../config";

export const addJournalModal = defineModal<{ name: string; write: JournalWrite }>()({
  component: AddJournalModal,
  title: () => m.journal_add_modal_title(),
});

export const dateModificationsModal = defineModal()({
  component: DateModificationsModal,
  title: () => m.variable_modifications_modal_title(),
});

export const deleteJournalModal = defineModal<{ mode: "keep" | "clear" | "delete" }>()({
  component: DeleteJournalModal,
  title: ({ journalName }: { journalName: string }) => m.journal_delete_modal_title({ name: journalName }),
});

export type FrontmatterFieldName = "dateField" | "startDateField" | "endDateField";

export const editFrontmatterFieldModal = defineModal<{ newValue: string }>()({
  component: EditFrontmatterFieldModal,
  title: ({ fieldName }: { journalName: string; fieldName: FrontmatterFieldName }) =>
    m.journal_fm_field_modal_title({ field: fieldName }),
});

export const editSequencePropertyModal = defineModal<{ newValue: string }>()({
  component: EditSequencePropertyModal,
  title: (_: { journalName: string; sourceIndex: number }) => m.journal_sequence_property_modal_title(),
});

export const renameJournalModal = defineModal<{ newName: string }>()({
  component: RenameJournalModal,
  title: ({ currentName }: { currentName: string }) => m.journal_rename_modal_title({ name: currentName }),
});

export const templaterSupportModal = defineModal()({
  component: TemplaterSupportModal,
  title: () => m.templater_support_modal_title(),
});

export interface VariableReferenceModalProps {
  context: VariableModalContext;
  journalName: string;
  dateFormat: string;
  hasCycle: boolean;
  numberingVariableNames: readonly string[];
  openModifications: () => void;
}

export const variableReferenceModal = defineModal()({
  component: VariableReferenceModal,
  title: (_: VariableReferenceModalProps) => m.journal_edit_variable_reference_modal_title(),
});

export const codeBlockReferenceModal = defineModal()({
  component: CodeBlockReferenceModal,
  title: (_: { journalName: string }) => m.journal_edit_code_block_reference_modal_title(),
  width: 780,
});
