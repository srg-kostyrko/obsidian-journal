import { Injectable } from "@/infra/di/decorators/Injectable";
import type { SettingsPersistence as SettingsPersistenceContract } from "./settings.types";

import { Settings, SettingsPersistence as SettingsPersistenceToken } from "./settings.tokens";
import { Result, type AsyncResult } from "@/infra/data-structures/result";
import { SettingsPersistenceError } from "./errors/settings-persistence.error";
import { JournalPlugin } from "@/obsidian/obsidian.tokens";
import { inject } from "@/infra/di/inject";
import { Logger } from "@/infra/logger/logger.tokens";
import { watchDebounced } from "@vueuse/core";

@Injectable(SettingsPersistenceToken)
export class SettingsPersistence implements SettingsPersistenceContract {
  #plugin = inject(JournalPlugin);
  #settings = inject(Settings);
  #logger = inject(Logger, "SettingsPersistence");

  #watchHandle: (() => void) | null = null;

  load(): AsyncResult<void, SettingsPersistenceError> {
    return Result.try(
      async () => {
        const data = await this.#plugin.loadData();
        // todo migration
        this.#settings.load(data);
      },
      (error) => SettingsPersistenceError.fromCatch(error),
    ).tapErr((error) => this.#logger.error("Failed to load settings", { error }));
  }
  run(): void {
    if (this.#watchHandle) return;
    this.#watchHandle = watchDebounced(
      () => this.#settings.data,
      async (data) => {
        try {
          await this.#plugin.saveData(data);
        } catch (error) {
          this.#logger.error("Failed to save settings", { error });
        }
      },
      { debounce: 500, maxWait: 1000 },
    );
  }
  // TODO add cleanup on plugin unload
}
