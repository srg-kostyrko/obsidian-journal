import { CalendarDate, Clock } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { AppActivity, NoticeService, NotesService, WorkspaceService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { JournalConfig } from "@/journals/config";
import { CycleService } from "@/journals/cycle";
import { JournalsIndex } from "@/journals/journals-index";
import { JournalsRepository } from "@/journals/repository";
import { TimelineService } from "@/journals/timeline";
import { isNotelet, type EntryChangedEvent } from "@/journals/types";
import { SettingsService } from "@/settings";

import { RolloverService } from "../rollover-service";
import { automaticBlocked, effectiveMove, moveDefaultsSlice } from "../settings";

import { noticeFor } from "./notice-policy";
import { QuietWindow } from "./quiet-window";

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
  readonly #seen = new Set<string>();
  readonly #paused = new Set<string>();
  readonly #stops: (() => void)[] = [];
  // number: window.setTimeout returns one; @types/express's Node globals would otherwise widen this to NodeJS.Timeout.
  #timer: number | undefined;
  #disposed = false;
  #phase: "idle" | "waiting" | "rolling" = "idle";
  #dirty = false;

  constructor() {
    this.#stops.push(
      // A timer does not advance through a suspend, so a return to the app is also a midnight.
      inject(AppActivity).onResume(() => this.#checkpoint()),
      this.#index.events.on("entryChanged", (event) => this.#onEntry(event)),
    );
    // Before the startup scan lands the index is empty rather than authoritative: no entry for
    // today's anchor would read as "no current note".
    void this.#index.whenReady().then(() => this.#checkpoint());
  }

  // Obsidian replays "create" for every file while it loads, and those notes are not new. The flag
  // is read per event, never trusted from an onLayoutReady callback, which goes live late.
  #onEntry(event: EntryChangedEvent): void {
    if (event.kind !== "added" || (event.reason !== "created" && event.reason !== "appeared")) return;
    if (!this.#workspace.layoutReady) return;
    const { entry } = event;
    if (isNotelet(entry) || !this.#isAutomatic(entry.journalName)) return;
    const current = this.#cycle.anchorOf(entry.journalName, CalendarDate.today());
    if (current.isSome() && current.value === entry.anchor) this.#checkpoint();
  }

  #isAutomatic(name: string): boolean {
    return this.#journals
      .get(name)
      .map((config) => config.tasks.move.automatic)
      .getOr(false);
  }

  #checkpoint(): void {
    if (this.#disposed || !this.#index.isReady()) return;
    this.#schedule();
    // A run still waiting for quiet has read nothing yet, so it already covers this checkpoint.
    if (this.#phase === "waiting") return;
    if (this.#phase === "rolling") {
      this.#dirty = true;
      return;
    }
    void this.#run();
  }

  #schedule(): void {
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#disposed) return;
    this.#timer = window.setTimeout(() => this.#checkpoint(), Clock.msUntilNextLocalMidnight());
  }

  async #run(): Promise<void> {
    try {
      do {
        this.#dirty = false;
        this.#phase = "waiting";
        const verdict = await this.#quiet.wait();
        if (this.#disposed) return;
        if (verdict === "busy") {
          this.#logger.info("the vault did not settle; waiting for the next checkpoint");
          continue;
        }
        this.#phase = "rolling";
        await this.#rollAll();
      } while (this.#dirty && !this.#disposed);
    } finally {
      this.#phase = "idle";
      this.#schedule();
    }
  }

  async #rollAll(): Promise<void> {
    const opted = [...this.#journals.find().entries()]
      .filter(([, config]) => config.tasks.move.automatic)
      .toSorted(([a], [b]) => a.localeCompare(b));
    const prefix = opted.length > 1;
    for (const [name, config] of opted) {
      if (this.#disposed) return;
      try {
        await this.#rollJournal(name, config, prefix);
      } catch (error) {
        this.#logger.error("automatic rollover failed", { journalName: name, error });
      }
    }
  }

  async #rollJournal(name: string, config: JournalConfig, prefix: boolean): Promise<void> {
    if (automaticBlocked(effectiveMove(config.tasks.move, this.#defaults.state)) !== null) {
      if (!this.#paused.has(name)) {
        this.#paused.add(name);
        this.#notices.show(m.tasks_auto_roll_paused({ journal: name }));
      }
      return;
    }
    const current = this.#cycle.anchorOf(name, CalendarDate.today());
    if (current.isNone() || !this.#timeline.contains(name, current.value)) return;
    // A settings preview takes today's slot while no real note holds it.
    const target = this.#index.get(name, current.value);
    if (target.isNone() || this.#notes.find(target.value).isNone()) return;

    const result = await this.#rollover.roll(name, { interactive: false, createTarget: false });
    if (result.isErr()) {
      this.#logger.error("automatic rollover failed", { journalName: name, error: result.error });
      return;
    }
    if (result.value.noTarget) return;
    const notice = noticeFor(result.value, this.#seen, prefix);
    if (notice !== null) this.#notices.show(notice);
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
    for (const stop of this.#stops.splice(0)) stop();
  }
}
