import { match } from "ts-pattern";

import { m } from "@/i18n";

import { localMoment } from "./calendar";
import { DateTimeError } from "./errors";

import type { PeriodKind } from "./period";
import type { AnchorString } from "./types";

export type RelativePeriod = Exclude<PeriodKind, "decade">;

export function relativeDate(period: RelativePeriod, anchor: AnchorString, today: AnchorString): string {
  return match(period)
    .with("day", () => formatDay(anchor, today))
    .with("week", () => formatWeek(anchor, today))
    .with("month", () => formatMonth(anchor, today))
    .with("quarter", () => formatQuarter(anchor, today))
    .with("year", () => formatYear(anchor, today))
    .exhaustive();
}

function diffIn(unit: "week" | "month" | "quarter" | "year", anchor: AnchorString, today: AnchorString): number {
  return localMoment(anchor).startOf(unit).diff(localMoment(today).startOf(unit), unit);
}

function formatWeek(anchor: AnchorString, today: AnchorString): string {
  const diff = diffIn("week", anchor, today);
  if (diff === 0) return m.relative_date_this_week();
  if (diff === -1) return m.relative_date_last_week();
  if (diff === 1) return m.relative_date_next_week();
  if (diff < 0) return m.relative_date_n_weeks_ago({ count: -diff });
  return m.relative_date_n_weeks_from_now({ count: diff });
}

function formatMonth(anchor: AnchorString, today: AnchorString): string {
  const diff = diffIn("month", anchor, today);
  if (diff === 0) return m.relative_date_this_month();
  if (diff === -1) return m.relative_date_last_month();
  if (diff === 1) return m.relative_date_next_month();
  if (diff < 0) return m.relative_date_n_months_ago({ count: -diff });
  return m.relative_date_n_months_from_now({ count: diff });
}

function formatQuarter(anchor: AnchorString, today: AnchorString): string {
  const diff = diffIn("quarter", anchor, today);
  if (diff === 0) return m.relative_date_this_quarter();
  if (diff === -1) return m.relative_date_last_quarter();
  if (diff === 1) return m.relative_date_next_quarter();
  if (diff < 0) return m.relative_date_n_quarters_ago({ count: -diff });
  return m.relative_date_n_quarters_from_now({ count: diff });
}

function formatYear(anchor: AnchorString, today: AnchorString): string {
  const diff = diffIn("year", anchor, today);
  if (diff === 0) return m.relative_date_this_year();
  if (diff === -1) return m.relative_date_last_year();
  if (diff === 1) return m.relative_date_next_year();
  if (diff < 0) return m.relative_date_n_years_ago({ count: -diff });
  return m.relative_date_n_years_from_now({ count: diff });
}

function formatDay(_anchor: AnchorString, _today: AnchorString): string {
  throw new DateTimeError("relativeDate('day', ...) not yet implemented");
}
