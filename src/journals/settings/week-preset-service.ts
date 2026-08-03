import { nextTick } from "vue";

import { CalendarDate, WeekPeriod, calendarSlice } from "@/calendar";
import type { AnchorString, CalendarSliceState, WeekPresetApplier } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

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
}
