import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";
import type { JournalWrite } from "@/journals";

import AddJournalModal from "./AddJournalModal.vue";

import type { Component } from "vue";

export const addJournalModal: ModalDefinition<void, { name: string; write: JournalWrite }> = defineModal({
  component: AddJournalModal as Component,
  title: () => m.journal_add_modal_title(),
});
