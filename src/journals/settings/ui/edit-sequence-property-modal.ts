import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import EditSequencePropertyModal from "./EditSequencePropertyModal.vue";

export const editSequencePropertyModal: ModalDefinition<
  { journalName: string; sourceIndex: number },
  { newValue: string }
> = defineModal({
  component: EditSequencePropertyModal,
  title: () => m.journal_sequence_property_modal_title(),
});
