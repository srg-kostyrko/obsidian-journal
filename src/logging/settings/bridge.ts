import { watchEffect, type WatchStopHandle } from "vue";

import { inject } from "@/infrastructure/di";
import { LogLevelGateToken } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";

import { loggingSlice } from "./slice";

export class LoggingSettingsBridge {
  readonly #gate = inject(LogLevelGateToken);
  readonly #settings = inject(SettingsService);
  readonly #stop: WatchStopHandle;

  constructor() {
    const slice = this.#settings.getSlice(loggingSlice);
    this.#stop = watchEffect(() => {
      const state = slice.state;
      if (state === undefined) return;
      this.#gate.setThreshold(state.level);
    });
  }

  [Symbol.dispose](): void {
    this.#stop();
  }
}
