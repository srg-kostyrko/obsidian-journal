import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import WeekPresetPickerModal from "./WeekPresetPickerModal.vue";

import type { CalendarSliceState } from "../slice";

export const weekPresetPickerModal = defineModal<{ current: CalendarSliceState }, CalendarSliceState>({
  component: WeekPresetPickerModal,
  title: () => m.calendar_preset_picker_title(),
});
