import * as v from "valibot";

import type { CalendarDate } from "@/calendar";

/** Wildcard sentinel: a `day` or `month` equal to this matches every day / month. */
export const DATE_CONDITION_ANY = -1;

export const dateConditionSchema = v.object({
  type: v.literal("date"),
  day: v.union([v.literal(DATE_CONDITION_ANY), v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31))]),
  month: v.union([v.literal(DATE_CONDITION_ANY), v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(11))]),
  year: v.nullable(v.pipe(v.number(), v.integer())),
});

export type JournalDecorationDateCondition = v.InferOutput<typeof dateConditionSchema>;

// The condition stores month 0-based (January = 0), matching the period the date falls on;
// calendars and the settings UI speak 1-based (January = 1). These are the only two places
// that translation lives.
export function storedMonthToDisplay(month: number): number {
  return month + 1;
}

export function displayMonthToStored(displayMonth: number): number {
  return displayMonth - 1;
}

export function matchesDate(condition: JournalDecorationDateCondition, anchor: CalendarDate): boolean {
  const dayOk = condition.day === DATE_CONDITION_ANY || Number(anchor.format("D")) === condition.day;
  const monthOk =
    condition.month === DATE_CONDITION_ANY || displayMonthToStored(Number(anchor.format("M"))) === condition.month;
  const yearOk = condition.year === null || Number(anchor.format("YYYY")) === condition.year;
  return dayOk && monthOk && yearOk;
}
