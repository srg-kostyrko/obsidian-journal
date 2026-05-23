import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { JournalsRepository } from "../repository";

import { NoteCreationService } from "./note-creation";

export class AutoCreateService {
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #journals = inject(JournalsRepository);
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
    for (const [name, config] of this.#journals.find().entries()) {
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
