import { watch } from "vue";

import { colorToString } from "@/decorations";
import { inject } from "@/infrastructure/di";
import { WindowCssVariables } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { appearanceSlice, type AppearanceSliceState } from "./slice";

export function appearanceVariables(state: AppearanceSliceState): Record<string, string> {
  return {
    "--journal-saved-cell-today-color": colorToString(state.today.color),
    "--journal-saved-cell-today-bg": colorToString(state.today.background),
    "--journal-saved-cell-active-color": colorToString(state.active.color),
    "--journal-saved-cell-active-bg": colorToString(state.active.background),
    "--journal-saved-cell-selected-ring": colorToString(state.selectedRing),
  };
}

export class AppearanceVariables {
  readonly #slice = inject(SettingsService).getSlice(appearanceSlice);
  readonly #installed = inject(WindowCssVariables).install(() => appearanceVariables(this.#slice.state));

  constructor() {
    watch(
      () => this.#slice.state,
      () => {
        this.#installed.refresh();
      },
      { deep: true },
    );
  }
}
