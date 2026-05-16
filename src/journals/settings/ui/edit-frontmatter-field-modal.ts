import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import EditFrontmatterFieldModal from "./EditFrontmatterFieldModal.vue";

import type { Component } from "vue";

export type FrontmatterFieldName = "dateField" | "startDateField" | "endDateField";

export const editFrontmatterFieldModal: ModalDefinition<
  { journalName: string; fieldName: FrontmatterFieldName },
  { newValue: string }
> = defineModal({
  component: EditFrontmatterFieldModal as Component,
  title: ({ fieldName }: { journalName: string; fieldName: FrontmatterFieldName }) =>
    m.journal_fm_field_modal_title({ field: fieldName }),
});
