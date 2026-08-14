import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import WeekPresetPickerModal from "./WeekPresetPickerModal.vue";

import type { CalendarSliceState } from "../slice";

export const weekPresetPickerModal = defineModal<CalendarSliceState>()({
  component: WeekPresetPickerModal,
  title: (_: { current: CalendarSliceState }) => m.common_week_configuration(),
});
