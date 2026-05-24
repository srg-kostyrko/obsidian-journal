import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";

export const variableReferenceModal: ModalDefinition<
  {
    context: VariableModalContext;
    journalName: string;
    dateFormat: string;
    hasCycle: boolean;
    numberingVariableNames: readonly string[];
  },
  void
> = defineModal({
  component: VariableReferenceModal,
  title: () => m.journal_edit_variable_reference_modal_title(),
});
