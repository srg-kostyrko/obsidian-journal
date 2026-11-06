import { computed, type ComputedRef } from "vue";

import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import {
  calendarDisplaySlice,
  type CalendarDisplaySliceState,
  type OutsideDates,
  type OutsideDays,
} from "./settings/display-slice";

export type StructureKey =
  "weekPlacement" | "timelineNavigation" | "showHeading" | "showWeekdays" | "outsideDays" | "monthRows";
export type StructureValue<K extends StructureKey> = CalendarDisplaySliceState[K];

export function resolveStructure<T>(block: T | "default" | undefined, global: T): T {
  return block === undefined || block === "default" ? global : block;
}

// A block that says nothing follows the vault-wide default, so one setting can change every
// calendar without editing a note.
export function useResolvedStructure<K extends StructureKey>(
  key: K,
  getBlock: () => StructureValue<K> | "default" | undefined,
): ComputedRef<StructureValue<K>> {
  const slice = useService(SettingsService).getSlice(calendarDisplaySlice);
  return computed(() => resolveStructure(getBlock(), slice.state[key]));
}

export function resolveOutsideDates(choice: OutsideDays, automatic: OutsideDates): OutsideDates {
  switch (choice) {
    case "interactive": {
      return "active";
    }
    case "inert": {
      return "inactive";
    }
    case "hidden": {
      return "blank";
    }
    case "automatic": {
      return automatic;
    }
  }
}
