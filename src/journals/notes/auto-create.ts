import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { FrontmatterService } from "../frontmatter";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { NoteCreationService } from "./note-creation";

export class AutoCreateService {
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #journals = inject(JournalsRepository);
  readonly #timeline = inject(TimelineService);
  readonly #logger = inject(LoggerFactoryToken).named("auto-create");

  #timer: ReturnType<typeof window.setTimeout> | undefined;
  #disposed = false;

  async #tick(): Promise<void> {
    for (const [name, config] of this.#journals.find().entries()) {
      if (!config.autoCreate) continue;
      await this.createCurrent(name);
    }
    if (this.#disposed) return;
    this.#timer = window.setTimeout(() => {
      void this.#tick();
    }, Clock.msUntilNextLocalMidnight());
  }

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

  async createCurrent(name: string): Promise<void> {
    const anchor = CalendarDate.today().toAnchor();
    if (!this.#timeline.contains(name, anchor)) {
      this.#logger.debug("auto-create: today is outside the journal timeline", { name, anchor });
      return;
    }
    const metadata = this.#frontmatter.buildMetadata(name, anchor);
    if (metadata.kind === "err") {
      this.#logger.debug("auto-create: build metadata failed", { name, error: metadata.error });
      return;
    }
    const result = await this.#creation.ensureNote(name, metadata.value, { skipConfirmation: true });
    if (result.isErr()) {
      this.#logger.error("auto-create: ensureNote failed", { name, error: result.error });
    }
  }
}
