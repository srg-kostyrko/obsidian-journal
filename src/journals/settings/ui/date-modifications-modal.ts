import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DateModificationsModal from "./DateModificationsModal.vue";

import type { Component } from "vue";

export const dateModificationsModal: ModalDefinition<Record<string, never>, void> = defineModal({
  component: DateModificationsModal as Component,
  title: () => m.variable_modifications_modal_title(),
});
