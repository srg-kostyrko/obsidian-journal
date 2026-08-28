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

const CREATE_BUDGET_MS = 30_000;

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
    // Armed before the loop, not after it: a createCurrent that never settles would otherwise
    // leave the timer unset and auto-create dead for the rest of the session. A `finally` is no
    // help — a never-settling await never reaches one.
    this.#schedule();
    for (const [name, config] of this.#journals.find().entries()) {
      if (!config.autoCreate) continue;
      await this.#createWithinBudget(name);
    }
  }

  #schedule(): void {
    if (this.#disposed) return;
    this.#timer = window.setTimeout(() => {
      void this.#tick();
    }, Clock.msUntilNextLocalMidnight());
  }

  // A journal template that blocks on user input (Templater's tp.system.prompt/suggester) leaves
  // ensureNote pending until somebody answers, and at local midnight nobody does. The wait is
  // bounded so the journals after it still get their notes; the call is abandoned, not cancelled,
  // so a merely slow template still writes its note once it finishes.
  async #createWithinBudget(name: string): Promise<void> {
    const budget = Promise.withResolvers<"timed-out">();
    const budgetTimer = window.setTimeout(() => budget.resolve("timed-out"), CREATE_BUDGET_MS);
    const outcome = await Promise.race([this.createCurrent(name).then(() => "settled" as const), budget.promise]);
    window.clearTimeout(budgetTimer);
    if (outcome === "timed-out") {
      this.#logger.warn("auto-create: gave up waiting for note creation", { name, budgetMs: CREATE_BUDGET_MS });
    }
  }

  initialize(): AsyncResult<void, never> {
    // ensureNote's index lookup is the only thing keeping a connected note that lives away from
    // its derived path (bulk-added keeping its name, renamed, moved) from being duplicated, and
    // the index is empty until the boot-time vault walk lands.
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
    const result = await this.#creation.ensureNote(name, metadata.value, { skipConfirmation: true, unattended: true });
    if (result.isErr()) {
      this.#logger.error("auto-create: ensureNote failed", { name, error: result.error });
    }
  }
}
