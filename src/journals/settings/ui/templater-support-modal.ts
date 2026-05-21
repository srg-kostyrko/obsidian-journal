import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import TemplaterSupportModal from "./TemplaterSupportModal.vue";

import type { Component } from "vue";

export const templaterSupportModal: ModalDefinition<Record<string, never>, void> = defineModal({
  component: TemplaterSupportModal as Component,
  title: () => m.templater_support_modal_title(),
});
