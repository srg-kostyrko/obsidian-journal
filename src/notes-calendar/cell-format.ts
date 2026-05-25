import { match } from "ts-pattern";

import type { PeriodKind } from "@/calendar";

export function defaultFormatPattern(kind: PeriodKind): string {
  return match(kind)
    .with("day", () => "D")
    .with("week", () => "[W]ww")
    .with("month", () => "MMM")
    .with("quarter", () => "[Q]Q")
    .with("year", () => "YYYY")
    .with("decade", () => "YYYY")
    .exhaustive();
}
