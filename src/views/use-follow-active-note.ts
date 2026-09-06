import { watch } from "vue";

import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { CycleService } from "@/journals";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar/active-entry";
import { entryCoversDate } from "@/notes-calendar/entry-coverage";

export interface FollowActiveNoteOptions {
  readonly enabled: () => boolean;
  readonly inScope: (journalName: string) => boolean;
  readonly currentDate: () => AnchorString;
  readonly onFollow: (date: AnchorString) => void;
}

export function useFollowActiveNote(options: FollowActiveNoteOptions): void {
  const activeEntry = useService(ActiveEntryViewModel);
  const cycle = useService(CycleService);

  // Weeks are the only period whose representative day (the one carrying the week-year)
  // differs from its start; there, the representative day is itself information the view
  // must move to carry, so holding on the current date would hide the cross-year change.
  function representativeIsStart(entry: ActiveEntryRef): boolean {
    return cycle
      .startOf(entry.journalName, entry.anchor)
      .flatMap((start) =>
        cycle.representativeOf(entry.journalName, entry.anchor).map((representative) => representative.isSame(start)),
      )
      .getOr(true);
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
      if (entryCoversDate(cycle, active, options.currentDate()) && representativeIsStart(active)) return;
      const date = cycle
        .representativeOf(active.journalName, active.anchor)
        .map((day) => day.toAnchor())
        .getOr(active.anchor);
      options.onFollow(date);
    },
    { immediate: true },
  );
}
