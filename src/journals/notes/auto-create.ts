import { CalendarDate, Clock } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { PlatformService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { JournalsRepository } from "../repository";
import { TimelineService } from "../timeline";

import { creationAllowedOn, noteCreationSlice } from "./creation-slice";
import { JournalDateFormatError } from "./errors";
import { FormatFailureLog } from "./format-failure-log";
import { NoteCreationService, type NoteCreationError } from "./note-creation";

const CREATE_BUDGET_MS = 30_000;

export class AutoCreateService {
  readonly #creation = inject(NoteCreationService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #index = inject(JournalsIndex);
  readonly #timeline = inject(TimelineService);
  readonly #platform = inject(PlatformService);
  readonly #logger = inject(LoggerFactoryToken).named("auto-create");
  readonly #formatFailures = inject(FormatFailureLog);

  readonly #noteCreation = inject(SettingsService).getSlice(noteCreationSlice);

  // number: window.setTimeout returns one; @types/express's Node globals would otherwise widen this to NodeJS.Timeout.
  #timer: number | undefined;
  #disposed = false;

  async #tick(): Promise<void> {
    // Armed before the loop, not after it: a createCurrent that never settles would otherwise
    // leave the timer unset and auto-create dead for the rest of the session. A `finally` is no
    // help — a never-settling await never reaches one.
    this.#schedule();
    // Read per tick, not once at construction: the rule can change while the app is running, and
    // the next tick is the first moment that can honor it.
    if (!creationAllowedOn(this.#noteCreation.state.devices, this.#platform.current())) return;
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

  /** Creates the journal's note for today; a date format that cannot render is logged once, never noticed. */
  async createCurrent(name: string): Promise<Result<void, NoteCreationError>> {
    // Resolve today to the journal period's canonical anchor; a raw mid-period date would be
    // written to frontmatter and then rejected by parseEntry, orphaning the note.
    const anchorOpt = this.#cycle.anchorOf(name, CalendarDate.today());
    if (anchorOpt.isNone()) return new Ok(undefined);
    const anchor = anchorOpt.value;
    if (!this.#timeline.contains(name, anchor)) {
      this.#logger.debug("auto-create: today is outside the journal timeline", { name, anchor });
      return new Ok(undefined);
    }
    const metadata = this.#frontmatter.buildMetadata(name, anchor);
    if (metadata.kind === "err") {
      this.#logger.debug("auto-create: build metadata failed", { name, error: metadata.error });
      return new Ok(undefined);
    }
    const result = await this.#creation.ensureNote(name, metadata.value, { skipConfirmation: true, unattended: true });
    if (result.isOk()) return new Ok(undefined);
    if (result.error instanceof JournalDateFormatError) {
      this.#formatFailures.warnOnce(name, result.error);
    } else {
      this.#logger.error("auto-create: ensureNote failed", { name, error: result.error });
    }
    return new Err(result.error);
  }
}
