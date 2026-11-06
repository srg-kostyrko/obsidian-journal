import { match } from "ts-pattern";

import { activeLocale, type CalendarDate, type Labels, type PeriodKind, type WeekdayLabel } from "@/calendar";
import { formatHasWrongWeek } from "@/journals/settings/ui/wrong-week";

export function defaultFormatPattern(kind: PeriodKind): string {
  return match(kind)
    .with("day", () => "D")
    .with("week", () => "[W]w")
    .with("month", () => "MMMM")
    .with("quarter", () => "[Q]Q")
    .with("year", () => "YYYY")
    .with("decade", () => "YYYY")
    .exhaustive();
}

// A cell's visible label leans on the grid around it for context — "25" reads as a date only
// because it sits under a month heading in a column of weekdays. Read aloud on its own it is
// just a number, so the accessible name carries the context the grid was supplying.
export function accessibleFormatPattern(kind: PeriodKind): string {
  return match(kind)
    .with("day", () => "LL")
    .with("week", () => "[W]w gggg")
    .with("month", () => "MMMM YYYY")
    .with("quarter", () => "[Q]Q YYYY")
    .with("year", () => "YYYY")
    .with("decade", () => "YYYY")
    .exhaustive();
}

export function labelPattern(labels: Labels, kind: PeriodKind): string {
  const stored = labels[kind === "decade" ? "year" : kind];
  return stored === "" ? defaultFormatPattern(kind) : stored;
}

export function formatWeekday(date: CalendarDate, label: WeekdayLabel): string {
  if (label.type === "pattern") {
    return date.format(label.pattern || "ddd");
  }
  const locale = activeLocale();
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(date.toJSDate());
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    return new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date.toJSDate());
  }
}

export function weekFormatNeedsIsoWarning(pattern: string, isIso: boolean): boolean {
  return !isIso && formatHasWrongWeek(pattern);
}
