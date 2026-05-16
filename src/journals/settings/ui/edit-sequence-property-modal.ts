import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import EditSequencePropertyModal from "./EditSequencePropertyModal.vue";

import type { Component } from "vue";

export const editSequencePropertyModal: ModalDefinition<
  { journalName: string; sourceIndex: number },
  { newValue: string }
> = defineModal({
  component: EditSequencePropertyModal as Component,
  title: () => m.journal_sequence_property_modal_title(),
});
