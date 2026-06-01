import { watchEffect, type WatchStopHandle } from "vue";

import { colorToString } from "@/decorations";
import { inject } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { appearanceSlice, type AppearanceSliceState } from "./slice";

const VARS = {
  todayColor: "--journal-cell-today-color",
  todayBg: "--journal-cell-today-bg",
  activeColor: "--journal-cell-active-color",
  activeBg: "--journal-cell-active-bg",
} as const;

export class CalendarAppearanceBridge {
  readonly #settings = inject(SettingsService);
  readonly #stop: WatchStopHandle;

  constructor() {
    const slice = this.#settings.getSlice(appearanceSlice);
    this.#stop = watchEffect(() => {
      this.#sync(slice.state);
    });
  }

  [Symbol.dispose](): void {
    this.#stop();
    for (const name of Object.values(VARS)) activeDocument.body.style.removeProperty(name);
  }

  #sync(state: AppearanceSliceState | undefined): void {
    if (state === undefined) return;
    const root = activeDocument.body.style;
    root.setProperty(VARS.todayColor, colorToString(state.today.color));
    root.setProperty(VARS.todayBg, colorToString(state.today.background));
    root.setProperty(VARS.activeColor, colorToString(state.active.color));
    root.setProperty(VARS.activeBg, colorToString(state.active.background));
  }
}
