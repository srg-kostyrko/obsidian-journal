import type { OpenInterval, Period } from "@/calendar";
import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import DatePickerModal from "./DatePickerModal.vue";

import type { Picking } from "./errors";

export interface DatePickerModalProps {
  picking: Picking;
  bounds?: OpenInterval;
  selected?: Period | null;
}

export const datePickerModal = defineModal<Period>()({
  component: DatePickerModal,
  title: (_: DatePickerModalProps) => m.calendar_date_picker_title(),
  width: 400,
});
