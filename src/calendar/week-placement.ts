import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { calendarDisplaySlice, type WeekPlacement } from "./settings/display-slice";

export type WeekPlacementConfig = WeekPlacement | "default";

export function resolveWeekPlacement(
  configWeeks: WeekPlacementConfig | undefined,
  globalDefault: WeekPlacement,
): WeekPlacement {
  return configWeeks === undefined || configWeeks === "default" ? globalDefault : configWeeks;
}

export function useResolvedWeekPlacement(
  getConfigWeeks: () => WeekPlacementConfig | undefined,
): ComputedRef<WeekPlacement> {
  const slice = useService(SettingsService).getSlice(calendarDisplaySlice);
  return computed(() => resolveWeekPlacement(getConfigWeeks(), slice.state.weekPlacement));
}
