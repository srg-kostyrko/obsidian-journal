import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { calendarDisplaySlice } from "./settings/display-slice";

// A block that says nothing follows the vault-wide default, the same shape `weeks` uses —
// so one setting can turn the row on everywhere without editing a note.
export function useResolvedTimelineNavigation(getConfigNavigation: () => boolean | undefined): ComputedRef<boolean> {
  const slice = useService(SettingsService).getSlice(calendarDisplaySlice);
  return computed(() => getConfigNavigation() ?? slice.state.timelineNavigation);
}
