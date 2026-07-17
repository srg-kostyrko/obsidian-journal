import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { NoteCreationService } from "./note-creation";

export class AutoCreateService {
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #index = inject(JournalsIndex);
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
    // ensureNote's index lookup is the only thing keeping a connected note that lives away from
    // its derived path (bulk-added keeping its name, renamed, moved) from being duplicated, and
    // the index is empty until the boot-time vault walk lands. v2 ran auto-create inside
    // onLayoutReady, strictly after its own reindex, for the same reason.
    void this.#index.whenReady().then(() => this.#tick());
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
    // Resolve today to the journal period's canonical anchor; a raw mid-period date would be
    // written to frontmatter and then rejected by parseEntry, orphaning the note.
    const anchorOpt = this.#cycle.anchorOf(name, CalendarDate.today());
    if (anchorOpt.isNone()) return;
    const anchor = anchorOpt.value;
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
