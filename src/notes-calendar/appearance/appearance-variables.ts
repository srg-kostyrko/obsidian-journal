import { watch, type WatchStopHandle } from "vue";

import { colorToString, type ColorSettings } from "@/decorations";
import { inject } from "@/infrastructure/di";
import { WindowCssVariables } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { appearanceSlice, type AppearanceSliceState } from "./slice";

const defaults = appearanceSlice.defaults;

function sameColor(a: ColorSettings, b: ColorSettings): boolean {
  const left = Object.entries(a);
  const right = b as Record<string, unknown>;
  return left.length === Object.keys(b).length && left.every(([key, value]) => right[key] === value);
}

/** Leaves out stock colors so they resolve through the calendar's own fallback, as before saved colors became variables. */
export function appearanceVariables(state: AppearanceSliceState): Record<string, string> {
  const entries: [string, ColorSettings, ColorSettings][] = [
    ["--journal-saved-cell-today-color", state.today.color, defaults.today.color],
    ["--journal-saved-cell-today-bg", state.today.background, defaults.today.background],
    ["--journal-saved-cell-active-color", state.active.color, defaults.active.color],
    ["--journal-saved-cell-active-bg", state.active.background, defaults.active.background],
    ["--journal-saved-cell-selected-ring", state.selectedRing, defaults.selectedRing],
  ];
  return Object.fromEntries(
    entries.filter(([, color, stock]) => !sameColor(color, stock)).map(([name, color]) => [name, colorToString(color)]),
  );
}

export class AppearanceVariables {
  readonly #slice = inject(SettingsService).getSlice(appearanceSlice);
  readonly #installed = inject(WindowCssVariables).install(() => appearanceVariables(this.#slice.state));
  readonly #stop: WatchStopHandle;

  constructor() {
    this.#stop = watch(
      () => this.#slice.state,
      () => {
        this.#installed.refresh();
      },
      { deep: true },
    );
  }

  [Symbol.dispose](): void {
    this.#stop();
    this.#installed.remove();
  }
}
