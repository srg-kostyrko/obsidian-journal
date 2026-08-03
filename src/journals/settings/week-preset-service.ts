import { nextTick } from "vue";

import { CalendarDate, WeekPeriod, calendarSlice } from "@/calendar";
import type { AnchorString, CalendarSliceState, WeekPresetApplier } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { attempt, type AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { JournalsIndex } from "../journals-index";
import { NoteConnectionService } from "../notes/note-connection";
import { JournalsRepository } from "../repository";

interface WeekSnapshot {
  readonly journalName: string;
  readonly notes: readonly { readonly path: VaultPath; readonly weekYear: number; readonly weekOfYear: number }[];
}

export class WeekPresetService implements WeekPresetApplier {
  readonly #settings = inject(SettingsService);
  readonly #journals = inject(JournalsRepository);
  readonly #index = inject(JournalsIndex);
  readonly #connection = inject(NoteConnectionService);
  readonly #notices = inject(NoticeService);

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
        return { path, weekYear: week.year, weekOfYear: week.weekOfYear };
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
        const targets = new Map<VaultPath, AnchorString>(
          notes.map(({ path, weekYear, weekOfYear }) => [
            path,
            WeekPeriod.ofWeek(weekYear, weekOfYear).anchor.toAnchor(),
          ]),
        );
        const report = yield* this.#connection.reanchorAll(journalName, targets);
        failed += report.failed;
      }
      if (failed > 0) this.#notices.show(m.calendar_reanchor_failed_notice({ count: failed }));
    });
  }

  apply(next: CalendarSliceState): AsyncResult<void, never> {
    // Week identity has to be read before the grid moves; afterwards the old numbering is gone.
    const snapshots = this.#snapshot();
    this.#settings.getSlice(calendarSlice).state = next;
    return this.#reanchor(snapshots);
  }
}
