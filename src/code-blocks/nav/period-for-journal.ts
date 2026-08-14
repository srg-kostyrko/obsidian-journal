import { match } from "ts-pattern";

import { CalendarDate, periodOfKind, type AnchorString, type Period } from "@/calendar";
import type { JournalWrite } from "@/journals";

export function periodForJournal(write: JournalWrite, anchor: AnchorString): Period {
  const date = CalendarDate.fromAnchor(anchor);
  return match(write)
    .with({ type: "day" }, () => periodOfKind("day", date))
    .with({ type: "week" }, () => periodOfKind("week", date))
    .with({ type: "month" }, () => periodOfKind("month", date))
    .with({ type: "quarter" }, () => periodOfKind("quarter", date))
    .with({ type: "year" }, () => periodOfKind("year", date))
    .with({ type: "custom" }, () => periodOfKind("day", date))
    .exhaustive();
}
