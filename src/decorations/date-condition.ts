import * as v from "valibot";

import type { CalendarDate } from "@/calendar";

/** Wildcard sentinel: a `day` or `month` equal to this matches every day / month. */
export const DATE_CONDITION_ANY = -1;

export const DATE_CONDITION_LAST_DAY = "last";

const weekdayOfMonthSchema = v.object({
  nth: v.union([v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5), v.literal("last")]),
  weekday: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
});

// "Last" is a string and the ordinal an object, never a negative number: -1 is already the
// wildcard, and a value an older version's schema rejects is what makes its loader drop the
// decoration rather than read the condition as "any day".
export const dateConditionSchema = v.object({
  type: v.literal("date"),
  day: v.union([
    v.literal(DATE_CONDITION_ANY),
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31)),
    v.literal(DATE_CONDITION_LAST_DAY),
    weekdayOfMonthSchema,
  ]),
  month: v.union([v.literal(DATE_CONDITION_ANY), v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(11))]),
  year: v.nullable(v.pipe(v.number(), v.integer())),
});

export type JournalDecorationDateCondition = v.InferOutput<typeof dateConditionSchema>;
export type DateConditionDay = JournalDecorationDateCondition["day"];
export type DateConditionWeekdayOfMonth = v.InferOutput<typeof weekdayOfMonthSchema>;

export function isWeekdayOfMonth(day: DateConditionDay): day is DateConditionWeekdayOfMonth {
  return typeof day === "object";
}

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
  const dayOk = matchesDay(condition.day, anchor);
  const monthOk = condition.month === DATE_CONDITION_ANY || displayMonthToStored(anchor.month) === condition.month;
  const yearOk = condition.year === null || anchor.year === condition.year;
  return dayOk && monthOk && yearOk;
}

function matchesDay(day: DateConditionDay, anchor: CalendarDate): boolean {
  if (day === DATE_CONDITION_ANY) return true;
  if (typeof day === "number") return anchor.day === day;
  const monthLength = anchor.endOf("month").day;
  if (day === DATE_CONDITION_LAST_DAY) return anchor.day === monthLength;
  if (anchor.weekday() !== day.weekday) return false;
  if (day.nth === "last") return anchor.day + 7 > monthLength;
  return Math.floor((anchor.day - 1) / 7) + 1 === day.nth;
}
