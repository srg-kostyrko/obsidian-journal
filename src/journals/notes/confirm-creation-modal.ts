import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfirmCreationModal from "./ConfirmCreationModal.vue";

import type { Component } from "vue";

export const confirmCreationModal = defineModal<{ journalName: string; noteName: string }, boolean>({
  component: ConfirmCreationModal as Component,
  title: () => m.confirm_note_creation_title(),
});
