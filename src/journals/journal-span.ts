import { match } from "ts-pattern";

import type { JournalWrite } from "./config";

// Nominal, not measured: a journal's place among the others has to hold for every date, and
// the length of an actual period does not — an "every 30 days" journal would outrank a monthly
// one in February and rank below it in March.
const SPAN_DAYS = {
  day: 1,
  week: 7,
  month: 30.44,
  quarter: 91.31,
  year: 365.25,
} as const;

/** How long one of the journal's periods runs, in days, for ordering journals by granularity. */
export function nominalSpanDays(write: JournalWrite): number {
  return match(write)
    .with({ type: "custom" }, (custom) => SPAN_DAYS[custom.every] * custom.duration)
    .otherwise((fixed) => SPAN_DAYS[fixed.type]);
}
