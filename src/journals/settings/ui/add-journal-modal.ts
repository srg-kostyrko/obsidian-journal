import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import AddJournalModal from "./AddJournalModal.vue";

import type { JournalWrite } from "../../config";

export const addJournalModal: ModalDefinition<void, { name: string; write: JournalWrite }> = defineModal({
  component: AddJournalModal,
  title: () => m.journal_add_modal_title(),
});
