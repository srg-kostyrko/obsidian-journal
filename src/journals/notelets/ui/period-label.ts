import { CalendarDate, periodOfKind } from "@/calendar";
import { m } from "@/i18n";
import { accessibleFormatPattern } from "@/notes-calendar/cell-format";

import type { PeriodBounds } from "../listing";

export function periodLabelOf(bounds: PeriodBounds): string {
  if (bounds.kind !== null) {
    return periodOfKind(bounds.kind, CalendarDate.fromAnchor(bounds.start)).format(
      accessibleFormatPattern(bounds.kind),
    );
  }
  return m.journal_notelet_list_period_range({
    from: CalendarDate.fromAnchor(bounds.start).format("ll"),
    to: CalendarDate.fromAnchor(bounds.end).format("ll"),
  });
}
