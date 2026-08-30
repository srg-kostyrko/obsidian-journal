import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import AddJournalModal from "./AddJournalModal.vue";
import AddNoteletTypeModal from "./AddNoteletTypeModal.vue";
import CloneJournalModal from "./CloneJournalModal.vue";
import CodeBlockReferenceModal from "./CodeBlockReferenceModal.vue";
import DeleteJournalModal from "./DeleteJournalModal.vue";
import EditFrontmatterFieldModal from "./EditFrontmatterFieldModal.vue";
import EditNoteletCounterKeyModal from "./EditNoteletCounterKeyModal.vue";
import EditNumberingDigitModal from "./EditNumberingDigitModal.vue";
import EditPromptModal from "./EditPromptModal.vue";
import RenameJournalModal from "./RenameJournalModal.vue";
import RenameNoteletTypeModal from "./RenameNoteletTypeModal.vue";
import TemplaterSupportModal from "./TemplaterSupportModal.vue";
import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";
import type { JournalWrite, NumberingReset } from "../../config";
import type { Prompt } from "../../prompts/config";

export const addJournalModal = defineModal<{ name: string; write: JournalWrite }>()({
  component: AddJournalModal,
  title: () => m.journal_add_modal_title(),
});

export const addNoteletTypeModal = defineModal<{ name: string }>()({
  component: AddNoteletTypeModal,
  title: (_props: { journalName: string }) => m.journal_notelet_add_modal_title(),
});

export const deleteJournalModal = defineModal<{ mode: "keep" | "clear" | "delete" }>()({
  component: DeleteJournalModal,
  title: ({ journalName }: { journalName: string }) => m.journal_delete_modal_title({ name: journalName }),
});

export const cloneJournalModal = defineModal<{ newName: string }>()({
  component: CloneJournalModal,
  title: ({ sourceName }: { sourceName: string; suggestedName: string }) =>
    m.journal_clone_modal_title({ name: sourceName }),
});

export type FrontmatterFieldName = "dateField" | "startDateField" | "endDateField";

export const editFrontmatterFieldModal = defineModal<{ newValue: string }>()({
  component: EditFrontmatterFieldModal,
  title: ({ fieldName }: { journalName: string; fieldName: FrontmatterFieldName }) =>
    m.journal_fm_field_modal_title({ field: fieldName }),
});

export const editNoteletCounterKeyModal = defineModal<{ newValue: string }>()({
  component: EditNoteletCounterKeyModal,
  title: (_props: { journalName: string; typeId: string }) => m.journal_notelet_counter_key_modal_title(),
});

export interface NumberingDigitDraft {
  variable: string;
  frontmatterKey: string;
  anchorValue: number;
  reset: NumberingReset;
}

export const editNumberingDigitModal = defineModal<NumberingDigitDraft>()({
  component: EditNumberingDigitModal,
  title: ({ sourceIndex }: { journalName: string; sourceIndex?: number }) =>
    m.journal_sequence_digit_modal_title({ mode: sourceIndex === undefined ? "add" : "edit" }),
});

export const editPromptModal = defineModal<Prompt>()({
  component: EditPromptModal,
  title: ({ promptIndex }: { journalName: string; typeId?: string; promptIndex?: number }) =>
    m.journal_prompt_modal_title({ mode: promptIndex === undefined ? "add" : "edit" }),
});

export const renameJournalModal = defineModal<{ newName: string }>()({
  component: RenameJournalModal,
  title: ({ currentName }: { currentName: string }) => m.journal_rename_modal_title({ name: currentName }),
});

export const renameNoteletTypeModal = defineModal<{ newName: string }>()({
  component: RenameNoteletTypeModal,
  title: ({ currentName }: { journalName: string; typeId: string; currentName: string }) =>
    m.journal_notelet_rename_modal_title({ name: currentName }),
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
  promptVariables: readonly Pick<Prompt, "variable" | "question" | "type">[];
  notelet?: boolean;
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
