import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { activeLocale } from "../calendar";
import { calendarDisplaySlice } from "../settings/display-slice";
import { resolveWeekend } from "../weekend";

export function useWeekend(): ComputedRef<ReadonlySet<number>> {
  const slice = useService(SettingsService).getSlice(calendarDisplaySlice);
  return computed(() => resolveWeekend(slice.state.weekend, activeLocale()));
}
