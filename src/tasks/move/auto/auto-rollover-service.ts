import { CalendarDate, Clock } from "@/calendar";
import { formatConjunction, m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { AppActivity, NoticeService, NotesService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { JournalConfig } from "@/journals/config";
import { CycleService } from "@/journals/cycle";
import { JournalNotFoundError } from "@/journals/errors";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";
import { JournalsEventsToken } from "@/journals/tokens";
import { isNotelet, type EntryChangedEvent } from "@/journals/types";
import { SettingsService } from "@/settings";

import { NoCurrentPeriodError } from "../errors";
import { RolloverService } from "../rollover-service";
import { automaticBlocked, effectiveMove, moveDefaultsSlice } from "../settings";

import { noticeFor } from "./notice-policy";
import { QuietWindow } from "./quiet-window";

import type { RollReport, RollSentenceKind } from "../report";

/** How long a boot or a return to the app waits before it starts listening for quiet. */
export const RESUME_DELAY_MS = 30_000;

// The pause notice says the same thing and says what to do about it.
const UNWRITTEN_KINDS: ReadonlySet<RollSentenceKind> = new Set(["source-changed", "source-write-failed"]);

function unwrittenAnchors(report: RollReport): readonly string[] {
  return [...new Set([...report.failedSources, ...report.changedSources].map(({ anchor }) => anchor))].toSorted();
}

// Clean means every earlier note was read and written: one skipped as indexing or unreadable may be
// the very note the pause is about, still offering what the paused roll already copied.
function isClean(report: RollReport): boolean {
  return (
    report.failedSources.length === 0 &&
    report.changedSources.length === 0 &&
    report.skippedSources.length === 0 &&
    report.unreadSources.length === 0
  );
}

function rekey<V>(map: Map<string, V>, from: string, to: string): void {
  const value = map.get(from);
  if (value === undefined) return;
  map.delete(from);
  map.set(to, value);
}

/** Rolls each opted-in journal into its current note whenever the vault gives a reason to look. */
export class AutoRolloverService {
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #timeline = inject(TimelineService);
  readonly #notes = inject(NotesService);
  readonly #workspace = inject(WorkspaceService);
  readonly #notices = inject(NoticeService);
  readonly #quiet = inject(QuietWindow);
  readonly #rollover = inject(RolloverService);
  readonly #defaults = inject(SettingsService).getSlice(moveDefaultsSlice);
  readonly #logger = inject(LoggerFactoryToken).named("auto-rollover");

  // In memory on purpose: a record of past runs would be plugin state the note cannot rebuild.
  readonly #seen = new Map<string, Set<string>>();
  readonly #paused = new Map<string, "blocked" | "write-failed">();
  readonly #stops: (() => void)[] = [];
  // number: window.setTimeout returns one; @types/express's Node globals would otherwise widen this to NodeJS.Timeout.
  #timer: number | undefined;
  #delayTimer: number | undefined;
  #wake: (() => void) | undefined;
  #disposed = false;
  #phase: "idle" | "waiting" | "rolling" = "idle";
  #dirty = false;
  #wantsDelay = false;

  constructor() {
    this.#stops.push(
      // A timer does not advance through a suspend, so a return to the app is also a midnight.
      inject(AppActivity).onResume(() => this.#checkpoint({ delayed: true })),
      // A pause left under the old name would let the journal resume and copy the same items again.
      inject(JournalsEventsToken).on("renamed", (oldName, newName) => {
        rekey(this.#paused, oldName, newName);
        rekey(this.#seen, oldName, newName);
      }),
      this.#index.events.on("entryChanged", (event) => this.#onEntry(event)),
      // The pause asks for a roll by hand once the leftovers are dealt with; one that wrote every
      // source it took from is that roll.
      this.#rollover.events.on("rolled", (report) => {
        if (isClean(report) && this.#paused.get(report.journalName) === "write-failed") {
          this.#paused.delete(report.journalName);
        }
      }),
    );
    // Before the startup scan lands the index is empty rather than authoritative: no entry for
    // today's anchor would read as "no current note".
    void this.#index.whenReady().then(() => this.#checkpoint({ delayed: true }));
  }

  // Obsidian replays "create" for every file while it loads, and those notes are not new. The flag
  // is read per event, never trusted from an onLayoutReady callback, which goes live late.
  #onEntry(event: EntryChangedEvent): void {
    if (event.kind !== "added" || (event.reason !== "created" && event.reason !== "appeared")) return;
    if (!this.#workspace.layoutReady) return;
    const { entry } = event;
    if (isNotelet(entry) || !this.#isAutomatic(entry.journalName)) return;
    const current = this.#cycle.anchorOf(entry.journalName, CalendarDate.today());
    if (current.isSome() && current.value === entry.anchor) this.#checkpoint({ delayed: false });
  }

  #isAutomatic(name: string): boolean {
    return this.#journals
      .get(name)
      .map((config) => config.tasks.move.automatic)
      .getOr(false);
  }

  #optedIn(): [string, JournalConfig][] {
    return [...this.#journals.find().entries()]
      .filter(([, config]) => config.tasks.move.automatic)
      .toSorted(([a], [b]) => a.localeCompare(b));
  }

  // A boot or a return to the app is when a sync tool starts catching up, and the first few
  // seconds of that can be as quiet as a vault with nothing to fetch.
  #checkpoint({ delayed }: { delayed: boolean }): void {
    if (this.#disposed || !this.#index.isReady()) return;
    this.#schedule();
    if (this.#optedIn().length === 0) return;
    if (delayed) this.#wantsDelay = true;
    // A run still waiting for quiet has read nothing yet, so it already covers this checkpoint.
    if (this.#phase === "waiting") return;
    if (this.#phase === "rolling") {
      this.#dirty = true;
      return;
    }
    this.#run().catch((error: unknown) => {
      this.#logger.error("automatic rollover run failed", { error });
    });
  }

  #schedule(): void {
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#disposed) return;
    this.#timer = window.setTimeout(() => this.#checkpoint({ delayed: false }), Clock.msUntilNextLocalMidnight());
  }

  #sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.#wake = resolve;
      this.#delayTimer = window.setTimeout(resolve, ms);
    });
  }

  // At most one delay per wait, so a run of focus changes cannot hold the roll off for good. A
  // delay asked for once the wait is under way still runs, since the clock that asked for none may
  // only have fired because the machine just woke.
  async #settle(): Promise<boolean> {
    let delayed = false;
    for (;;) {
      if (this.#wantsDelay && !delayed) {
        delayed = true;
        await this.#sleep(RESUME_DELAY_MS);
        if (this.#disposed) return false;
      }
      const verdict = await this.#quiet.wait();
      if (this.#disposed) return false;
      if (verdict === "busy") {
        // Nothing left to roll, so nothing to wait for.
        if (this.#optedIn().length === 0) {
          this.#wantsDelay = false;
          return false;
        }
        this.#logger.info("the vault did not settle; waiting for quiet again");
        continue;
      }
      if (!this.#wantsDelay || delayed) break;
    }
    this.#wantsDelay = false;
    return true;
  }

  async #run(): Promise<void> {
    try {
      do {
        this.#dirty = false;
        this.#phase = "waiting";
        if (!(await this.#settle())) return;
        this.#phase = "rolling";
        await this.#rollAll();
      } while (this.#dirty && !this.#disposed);
    } finally {
      this.#phase = "idle";
      this.#schedule();
    }
  }

  async #rollAll(): Promise<void> {
    for (const [name, config] of this.#optedIn()) {
      if (this.#disposed) return;
      try {
        await this.#rollJournal(name, config);
      } catch (error) {
        this.#logger.error("automatic rollover failed", { journalName: name, error });
        this.#pauseAfterError(name);
      }
    }
  }

  // Whatever broke may have broken after the target was written, so the next checkpoint could copy
  // the same items again.
  #pauseAfterError(name: string): void {
    this.#paused.set(name, "write-failed");
    this.#notices.show(m.tasks_auto_roll_paused_error({ journal: name }));
  }

  async #rollJournal(name: string, config: JournalConfig): Promise<void> {
    const paused = this.#paused.get(name);
    if (paused === "write-failed") return;
    if (automaticBlocked(effectiveMove(config.tasks.move, this.#defaults.state)) !== null) {
      if (paused === undefined) {
        this.#paused.set(name, "blocked");
        this.#notices.show(m.tasks_auto_roll_paused({ journal: name }));
      }
      return;
    }
    // Lifted, so a later block is announced again.
    if (paused === "blocked") this.#paused.delete(name);
    const current = this.#cycle.anchorOf(name, CalendarDate.today());
    if (current.isNone() || !this.#timeline.contains(name, current.value)) return;
    // A settings preview takes today's slot while no real note holds it.
    const target = this.#index.get(name, current.value);
    if (target.isNone() || this.#notes.find(target.value).isNone()) return;

    const result = await this.#rollover.roll(name, { interactive: false, createTarget: false });
    if (result.isErr()) {
      // Midnight can pass between the check above and the roll's own; settings can delete the
      // journal meanwhile. Neither wrote anything.
      if (result.error instanceof NoCurrentPeriodError || result.error instanceof JournalNotFoundError) {
        this.#logger.info("the roll found nothing to roll into", { journalName: name, error: result.error });
        return;
      }
      this.#logger.error("automatic rollover failed", { journalName: name, error: result.error });
      this.#pauseAfterError(name);
      return;
    }
    const report = result.value;
    if (report.noTarget) return;
    const unwritten = unwrittenAnchors(report);
    const seen = this.#seen.get(name) ?? new Set<string>();
    this.#seen.set(name, seen);
    const notice = noticeFor(report, seen, unwritten.length > 0 ? UNWRITTEN_KINDS : undefined);
    if (notice !== null) this.#notices.show(notice);
    // The items reached the target but the source still offers them, so the next checkpoint
    // would copy them again.
    if (unwritten.length > 0) {
      this.#paused.set(name, "write-failed");
      this.#notices.show(
        m.tasks_auto_roll_paused_unwritten({
          journal: name,
          dates: formatConjunction(unwritten),
          count: unwritten.length,
        }),
      );
    }
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
    window.clearTimeout(this.#delayTimer);
    this.#delayTimer = undefined;
    this.#wake?.();
    for (const stop of this.#stops.splice(0)) stop();
  }
}
