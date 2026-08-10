import type { Period, PeriodKind } from "@/calendar";

import type { CellAttribution } from "../attribute-cell";
import type { JournalDecorationStyle } from "../config";

export type BreakdownCell =
  | {
      readonly kind: "fixed";
      readonly period: Period;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    }
  | {
      readonly kind: "interval";
      readonly period: Period;
      readonly journalName: string;
      readonly attribution: CellAttribution;
      readonly styles: readonly JournalDecorationStyle[];
    };

const PERIOD_FORMAT: Record<PeriodKind, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-[W]w",
  month: "YYYY-MM",
  quarter: "YYYY-[Q]Q",
  year: "YYYY",
  decade: "YYYY",
};

export function formatPeriod(p: Period): string {
  return p.format(PERIOD_FORMAT[p.kind]);
}
