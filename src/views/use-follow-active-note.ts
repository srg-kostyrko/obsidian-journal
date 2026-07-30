import { watch } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { CycleService } from "@/journals";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar/active-entry";

export interface FollowActiveNoteOptions {
  readonly enabled: () => boolean;
  readonly inScope: (journalName: string) => boolean;
  readonly currentDate: () => AnchorString;
  readonly onFollow: (date: AnchorString) => void;
}

export function useFollowActiveNote(options: FollowActiveNoteOptions): void {
  const activeEntry = useService(ActiveEntryViewModel);
  const cycle = useService(CycleService);

  function coversCurrentDate(entry: ActiveEntryRef): boolean {
    const current = CalendarDate.fromAnchor(options.currentDate());
    return cycle
      .startOf(entry.journalName, entry.anchor)
      .flatMap((start) =>
        cycle.endOf(entry.journalName, entry.anchor).map((end) => !current.isBefore(start) && !current.isAfter(end)),
      )
      .getOr(false);
  }

  // Watching the setting alongside the active note means turning following on syncs the view
  // to the note already open, rather than waiting for the next note switch to take effect.
  // currentDate is read inside the callback on purpose: the view's date moving is not itself
  // a reason to re-evaluate a follow.
  watch(
    [activeEntry.active, options.enabled],
    ([active]) => {
      if (!options.enabled()) return;
      if (active === null || !options.inScope(active.journalName)) return;
      // The view is already inside the opened note's own period, so moving the date would
      // scroll away from what the user is looking at without showing anything new.
      if (coversCurrentDate(active)) return;
      // A week's stored anchor is its first day; the representative day is the one whose
      // calendar year is the week-year, which is what a rendered {{date}} must carry.
      const date = cycle
        .representativeOf(active.journalName, active.anchor)
        .map((day) => day.toAnchor())
        .getOr(active.anchor);
      options.onFollow(date);
    },
    { immediate: true },
  );
}
