import { match } from "ts-pattern";

import type { PeriodKind } from "@/calendar";

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
