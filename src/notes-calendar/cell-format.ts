import { match } from "ts-pattern";

import {
  activeLocale,
  userDateFormat,
  type CalendarDate,
  type DateFormatError,
  type Labels,
  type PeriodKind,
  type UserDateFormat,
  type WeekdayLabel,
} from "@/calendar";
import { Ok, type Result } from "@/infrastructure/result";
import { formatHasWrongWeek } from "@/journals/settings/ui/wrong-week";

// Literal types, so a `user || default` fallback keeps the user pattern visible to the plain `format`'s guard.
export type DefaultFormatPattern = "D" | "[W]w" | "MMMM" | "[Q]Q" | "YYYY";

export function defaultFormatPattern(kind: PeriodKind): DefaultFormatPattern {
  return match(kind)
    .returnType<DefaultFormatPattern>()
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

export function labelPattern(labels: Labels, kind: PeriodKind): UserDateFormat {
  const stored = labels[kind === "decade" ? "year" : kind];
  return stored === "" ? userDateFormat(defaultFormatPattern(kind)) : stored;
}

/** What an empty weekday pattern renders. */
export const DEFAULT_WEEKDAY_PATTERN = "ddd";

const narrowWeekdayFormats = new Map<string, Intl.DateTimeFormat>();

function narrowWeekdayFormat(locale: string): Intl.DateTimeFormat {
  const cached = narrowWeekdayFormats.get(locale);
  if (cached !== undefined) return cached;
  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    created = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
  }
  narrowWeekdayFormats.set(locale, created);
  return created;
}

export function tryFormatWeekday(date: CalendarDate, label: WeekdayLabel): Result<string, DateFormatError> {
  if (label.type === "letter") return new Ok(narrowWeekdayFormat(activeLocale()).format(date.toJSDate()));
  return label.pattern === "" ? new Ok(date.format(DEFAULT_WEEKDAY_PATTERN)) : date.tryFormat(label.pattern);
}

// A pattern this device cannot render keeps the grid readable; the appearance editor reports it.
export function formatWeekday(date: CalendarDate, label: WeekdayLabel): string {
  return tryFormatWeekday(date, label).match({ ok: (text) => text, err: () => date.format(DEFAULT_WEEKDAY_PATTERN) });
}

/** What a narrow calendar's weekday shows when narrow has no label of its own. */
export const STOCK_NARROW_WEEKDAY: WeekdayLabel = { type: "letter" };

/** A weekday column's texts: `name` is its accessible name, `narrow` is the stock one letter when unset. */
export function weekdayTexts(
  date: CalendarDate,
  weekdayLabel: WeekdayLabel,
  weekdayLabelNarrow: WeekdayLabel | null,
): { wide: string; narrow: string; name: string } {
  return {
    wide: formatWeekday(date, weekdayLabel),
    narrow: formatWeekday(date, weekdayLabelNarrow ?? STOCK_NARROW_WEEKDAY),
    name: date.format("dddd"),
  };
}

export function weekFormatNeedsIsoWarning(pattern: string, isIso: boolean): boolean {
  return !isIso && formatHasWrongWeek(pattern);
}
