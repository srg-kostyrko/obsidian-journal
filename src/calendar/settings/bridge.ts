import { match } from "ts-pattern";
import { watchEffect, type WatchStopHandle } from "vue";

import { inject } from "@/infrastructure/di";
import { SettingsService } from "@/settings";

import { Calendar } from "../calendar";

import { calendarSlice, type CalendarSliceState } from "./slice";

export class CalendarSettingsBridge {
  readonly #calendar = inject(Calendar);
  readonly #settings = inject(SettingsService);
  readonly #stop: WatchStopHandle;

  constructor() {
    const slice = this.#settings.getSlice(calendarSlice);
    this.#stop = watchEffect(() => {
      this.#sync(slice.state);
    });
  }

  [Symbol.dispose](): void {
    this.#stop();
  }

  #sync(state: CalendarSliceState): void {
    match(state)
      .with({ mode: "locale" }, () => {
        this.#calendar.applyWeekConfig("locale", { propagateToGlobal: false });
      })
      .with({ mode: "custom" }, ({ dow, doy, global: propagateToGlobal }) => {
        this.#calendar.applyWeekConfig({ dow, doy }, { propagateToGlobal });
      })
      .exhaustive();
  }
}
