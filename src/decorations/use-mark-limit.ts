import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { decorationsSlice } from "./settings/slice";

export function useMarkLimit(): ComputedRef<number> {
  const slice = useService(SettingsService).getSlice(decorationsSlice);
  return computed(() => slice.state.maxMarksPerSlot);
}
