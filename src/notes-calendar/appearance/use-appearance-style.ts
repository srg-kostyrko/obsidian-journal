import { computed, type ComputedRef } from "vue";

import { colorToString } from "@/decorations";
import { useInjector } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { appearanceSlice, type AppearanceSliceState } from "./slice";

// Bound as inline CSS vars on each calendar surface (cells, period badges, interval rows) rather
// than once on the document body, so a calendar in any window — including a popout opened after
// the last appearance change — reflects the current colors, and edits update live (v2 behavior).
export function appearanceVariables(state: AppearanceSliceState): Record<string, string> {
  return {
    "--journal-cell-today-color": colorToString(state.today.color),
    "--journal-cell-today-bg": colorToString(state.today.background),
    "--journal-cell-active-color": colorToString(state.active.color),
    "--journal-cell-active-bg": colorToString(state.active.background),
  };
}

export function useCalendarAppearanceStyle(): ComputedRef<Record<string, string>> {
  // Settings are resolved optionally: a calendar mounted in isolation (component tests) has no
  // settings context and simply falls back to the theme defaults (no vars). In the running
  // plugin the slice is always present, so the highlight colors apply everywhere.
  const slice = optionalAppearanceSlice();
  return computed(() => (slice?.state === undefined ? {} : appearanceVariables(slice.state)));
}

function optionalAppearanceSlice() {
  try {
    return useInjector().resolve(SettingsService).getSlice(appearanceSlice);
  } catch {
    return;
  }
}
