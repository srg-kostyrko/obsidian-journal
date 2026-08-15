import { nextTick } from "vue";

import { CalendarDate, WeekPeriod, calendarSlice } from "@/calendar";
import type { AnchorString, CalendarSliceState, WeekPresetApplier } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsEventsToken, SettingsService } from "@/settings";

import { CycleService } from "../cycle";
import { JournalsIndex } from "../journals-index";
import { NoteConnectionService } from "../notes/note-connection";
import { JournalsRepository } from "../repository";

import type { ReanchorTarget } from "../notes/note-connection";

interface WeekSnapshot {
  readonly journalName: string;
  readonly notes: readonly {
    readonly path: VaultPath;
    readonly weekYear: number;
    readonly weekOfYear: number;
    // Undefined means "no manual extension" — resolved against the OLD grid, below, because
    // this is the last point in the flow where the old grid is still the live one.
    readonly endDate: AnchorString | undefined;
  }[];
}

export class WeekPresetService implements WeekPresetApplier {
  readonly #settings = inject(SettingsService);
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #connection = inject(NoteConnectionService);
  readonly #notices = inject(NoticeService);
  readonly #settingsEvents = inject(SettingsEventsToken);
  readonly #unsubscribes: (() => void)[] = [];
  #pending: readonly WeekSnapshot[] | undefined;

  // apply() is the picker's path and holds "move the grid" and "re-anchor the notes" together as
  // one transaction. A data.json from Obsidian Sync reaches the same slice without passing through
  // it — SettingsService.reload() refreshes every slice at once — so the invariant is re-established
  // here, at the settings layer's own seam, rather than only at the UI entry point.
  constructor() {
    this.#unsubscribes.push(
      // The snapshot has to be taken under the OLD grid: week identity is what survives the
      // change, and once the incoming slice lands nothing can recover which week an anchor meant.
      this.#settingsEvents.on("reloading", () => {
        const snapshots = this.#snapshot();
        this.#pending = snapshots.some(({ notes }) => notes.length > 0) ? snapshots : undefined;
      }),
      this.#settingsEvents.on("reloaded", () => {
        const snapshots = this.#pending;
        this.#pending = undefined;
        // A reload that left the grid alone re-anchors every note onto the anchor it already
        // has, which reanchorAll skips without writing — so no comparison is needed here.
        if (snapshots) void this.#reanchor(snapshots);
      }),
    );
  }

  // A stored end equal to the OLD grid's duration-derived default is period metadata the grid
  // change invalidates, not a manual extension — NoteConnectionService can't tell the two apart
  // itself once the grid has moved on, because CycleService only ever knows the current grid.
  #survivingEndDate(
    journalName: string,
    anchor: AnchorString,
    endDate: AnchorString | undefined,
  ): AnchorString | undefined {
    if (endDate === undefined) return undefined;
    const fallback = this.#cycle.defaultEndOf(journalName, anchor);
    if (fallback.isSome() && fallback.value.toAnchor() === endDate) return undefined;
    return endDate;
  }

  #snapshot(): readonly WeekSnapshot[] {
    const weekly = [
      ...this.#journals
        .find()
        .filter((config) => config.write.type === "week")
        .list(),
    ];
    return weekly.map((config) => ({
      journalName: config.name,
      notes: [...this.#index.entriesFor(config.name)].map(([anchor, path]) => {
        const week = WeekPeriod.containing(CalendarDate.fromAnchor(anchor));
        const entry = this.#index.entryByAnchor(config.name, anchor);
        const endDate = this.#survivingEndDate(config.name, anchor, entry.isSome() ? entry.value.endDate : undefined);
        return { path, weekYear: week.year, weekOfYear: week.weekOfYear, endDate };
      }),
    }));
  }

  #reanchor(snapshots: readonly WeekSnapshot[]): AsyncResult<void, never> {
    return attempt.in(this, async function* (this: WeekPresetService) {
      // CalendarSettingsBridge applies the new grid from a watchEffect, which flushes on
      // nextTick — read week boundaries before that and they still describe the old grid.
      await nextTick();
      let failed = 0;
      for (const { journalName, notes } of snapshots) {
        const targets = new Map<VaultPath, ReanchorTarget>(
          notes.map(({ path, weekYear, weekOfYear, endDate }) => [
            path,
            { anchor: WeekPeriod.ofWeek(weekYear, weekOfYear).anchor.toAnchor(), endDate },
          ]),
        );
        const report = yield* this.#connection.reanchorAll(journalName, targets);
        failed += report.failed;
      }
      if (failed > 0) this.#notices.show(m.calendar_reanchor_failed_notice({ count: failed }));
    });
  }

  apply(next: CalendarSliceState): AsyncResult<void, never> {
    // Week identity — and whether each note's stored end is a manual extension — has to be read
    // before the grid moves; afterwards the old grid, and the old numbering, are gone.
    const snapshots = this.#snapshot();
    this.#settings.getSlice(calendarSlice).state = next;
    return this.#reanchor(snapshots);
  }

  [Symbol.dispose](): void {
    for (const off of this.#unsubscribes) off();
    this.#unsubscribes.length = 0;
  }
}
