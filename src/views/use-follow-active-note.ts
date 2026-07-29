import { watch } from "vue";

import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { CycleService } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";

export interface FollowActiveNoteOptions {
  readonly enabled: () => boolean;
  readonly inScope: (journalName: string) => boolean;
  readonly onFollow: (date: AnchorString) => void;
}

export function useFollowActiveNote(options: FollowActiveNoteOptions): void {
  const activeEntry = useService(ActiveEntryViewModel);
  const cycle = useService(CycleService);

  // Watching the setting alongside the active note means turning following on syncs the view
  // to the note already open, rather than waiting for the next note switch to take effect.
  watch(
    [activeEntry.active, options.enabled],
    ([active]) => {
      if (!options.enabled()) return;
      if (active === null || !options.inScope(active.journalName)) return;
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
