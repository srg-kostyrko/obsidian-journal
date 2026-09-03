import { CalendarDate, type AnchorString } from "@/calendar";
import type { CycleService } from "@/journals";

import type { ActiveEntryRef } from "./active-entry";

export function entryCoversDate(cycle: CycleService, entry: ActiveEntryRef, date: AnchorString): boolean {
  const current = CalendarDate.fromAnchor(date);
  return cycle
    .startOf(entry.journalName, entry.anchor)
    .flatMap((start) =>
      cycle.endOf(entry.journalName, entry.anchor).map((end) => !current.isBefore(start) && !current.isAfter(end)),
    )
    .getOr(false);
}
