import type { OpenInterval, Period } from "@/calendar";
import { m } from "@/i18n";
import { defineModal, type ModalDefinition } from "@/infrastructure/host/modals";

import DatePickerModal from "./DatePickerModal.vue";

import type { Picking } from "./errors";
import type { Component } from "vue";

export interface DatePickerModalProps {
  picking: Picking;
  bounds?: OpenInterval;
  selected?: Period | null;
}

export const datePickerModalDefinition: ModalDefinition<DatePickerModalProps, Period> = defineModal({
  component: DatePickerModal as Component,
  title: () => m.calendar_date_picker_title(),
  width: 400,
});
