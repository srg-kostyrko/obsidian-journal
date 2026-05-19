import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "../config";
import { FrontmatterService } from "../frontmatter";

import { NoteCreationService } from "./note-creation";

import type { JournalConfig } from "../config";

export class AutoCreateService {
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #settings = inject(SettingsService);
  readonly #logger = inject(LoggerFactoryToken).named("auto-create");

  #timer: ReturnType<typeof window.setTimeout> | undefined;
  #disposed = false;

  initialize(): AsyncResult<void, never> {
    void this.#tick();
    return AsyncResult.ok();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
    if (this.#timer !== undefined) {
      window.clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  async #tick(): Promise<void> {
    const anchor = CalendarDate.today().toAnchor();
    const collection = this.#settings.getCollection(journalConfigCollection);
    for (const [name, configRaw] of Object.entries(collection.entries)) {
      const config = configRaw as JournalConfig;
      if (!config.autoCreate) continue;
      const metadata = this.#frontmatter.buildMetadata(name, anchor);
      if (metadata.kind === "err") {
        this.#logger.debug("auto-create: build metadata failed", { name, error: metadata.error });
        continue;
      }
      const result = await this.#creation.ensureNote(name, metadata.value);
      if (result.isErr()) {
        this.#logger.error("auto-create: ensureNote failed", { name, error: result.error });
      }
    }
    if (this.#disposed) return;
    this.#timer = window.setTimeout(() => {
      void this.#tick();
    }, Clock.msUntilNextLocalMidnight());
  }
}
