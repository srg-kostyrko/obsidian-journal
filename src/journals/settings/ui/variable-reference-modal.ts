import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";
import type { Component } from "vue";

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
  component: VariableReferenceModal as Component,
  title: () => m.journal_edit_variable_reference_modal_title(),
});
