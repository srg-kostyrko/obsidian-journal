import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { Component } from "vue";

export const variableReferenceModal: ModalDefinition<
  { journalName: string; dateFormat: string; hasNumbering: boolean },
  void
> = defineModal({
  component: VariableReferenceModal as Component,
  title: () => m.journal_edit_variable_reference_modal_title(),
});
