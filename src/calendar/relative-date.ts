import { match } from "ts-pattern";

import { m } from "@/i18n";

import { localMoment } from "./calendar";

import type { PeriodKind } from "./period";
import type { AnchorString } from "./types";

export type RelativePeriod = Exclude<PeriodKind, "decade">;

export function relativeDate(period: RelativePeriod, anchor: AnchorString, today: AnchorString): string {
  return match(period)
    .with("day", () => formatDay(anchor, today))
    .with("week", "month", "quarter", "year", (unit) => formatPeriod(unit, anchor, today))
    .exhaustive();
}

function formatPeriod(
  period: "week" | "month" | "quarter" | "year",
  anchor: AnchorString,
  today: AnchorString,
): string {
  const diff = localMoment(anchor).startOf(period).diff(localMoment(today).startOf(period), period);
  if (diff === 0) return m.relative_date_this({ period });
  if (diff === -1) return m.relative_date_last({ period });
  if (diff === 1) return m.relative_date_next({ period });
  if (diff < 0) return m.relative_date_ago({ period, count: -diff });
  return m.relative_date_from_now({ period, count: diff });
}

function formatDay(anchor: AnchorString, today: AnchorString): string {
  const anchorMoment = localMoment(anchor).startOf("day");
  const todayMoment = localMoment(today).startOf("day");
  const diff = anchorMoment.diff(todayMoment, "day");
  if (diff === 0) return m.common_label_today();
  if (diff === -1) return m.relative_date_yesterday();
  if (diff === 1) return m.relative_date_tomorrow();
  // The named-weekday window is ±(2-6) days; exactly a week falls to the day-count
  // phrasing ("7 days ago" / "in 7 days") rather than naming the weekday.
  if (diff >= -6 && diff < 0) return m.relative_date_last_named_day({ weekday: anchorMoment.format("dddd") });
  if (diff > 1 && diff <= 6) return m.relative_date_named_day({ weekday: anchorMoment.format("dddd") });
  return anchorMoment.from(todayMoment);
}
