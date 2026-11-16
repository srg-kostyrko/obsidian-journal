import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";

import {
  DATE_CONDITION_ANY,
  DATE_CONDITION_LAST_DAY,
  dateConditionSchema,
  matchesDate,
  type DateConditionDay,
  type JournalDecorationDateCondition,
} from "./date-condition";

const anchor = (iso: string): CalendarDate => CalendarDate.fromAnchor(iso as AnchorString);

const daysOf = (year: number, month: number): CalendarDate[] => {
  const out: CalendarDate[] = [];
  for (let day = 1; day <= 31; day++) {
    const parsed = CalendarDate.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (parsed.isOk()) out.push(parsed.value);
  }
  return out;
};

const matchingDays = (condition: JournalDecorationDateCondition, year: number, month: number): string[] =>
  daysOf(year, month)
    .filter((d) => matchesDate(condition, d))
    .map((d) => d.toAnchor());

const cond = (day: DateConditionDay, month: number, year: number | null): JournalDecorationDateCondition => ({
  type: "date",
  day,
  month,
  year,
});

describe("date-condition", () => {
  describe("matchesDate", () => {
    it("matches when day, month, and year all equal the anchor", () => {
      expect(matchesDate(cond(15, 2, 2026), anchor("2026-03-15"))).toBe(true);
    });

    it("does not match when the day differs", () => {
      expect(matchesDate(cond(16, 2, 2026), anchor("2026-03-15"))).toBe(false);
    });

    it("treats a wildcard day as matching any day", () => {
      expect(matchesDate(cond(DATE_CONDITION_ANY, 2, 2026), anchor("2026-03-15"))).toBe(true);
    });

    it("treats a wildcard month as matching any month", () => {
      expect(matchesDate(cond(15, DATE_CONDITION_ANY, 2026), anchor("2026-07-15"))).toBe(true);
    });

    it("treats a null year as matching any year", () => {
      expect(matchesDate(cond(15, 2, null), anchor("2030-03-15"))).toBe(true);
    });

    it("stores month 0-based, so month 0 matches January", () => {
      expect(matchesDate(cond(1, 0, null), anchor("2026-01-01"))).toBe(true);
    });
  });

  describe("last day", () => {
    const lastDay = cond(DATE_CONDITION_LAST_DAY, DATE_CONDITION_ANY, null);

    it("matches the last day of a 30- and a 31-day month", () => {
      expect(matchesDate(lastDay, anchor("2026-04-30"))).toBe(true);
      expect(matchesDate(lastDay, anchor("2026-01-31"))).toBe(true);
    });

    it("does not match the day before the last", () => {
      expect(matchesDate(lastDay, anchor("2026-04-29"))).toBe(false);
    });

    it("follows February's length in leap and common years", () => {
      expect(matchesDate(lastDay, anchor("2028-02-29"))).toBe(true);
      expect(matchesDate(lastDay, anchor("2027-02-28"))).toBe(true);
      expect(matchesDate(lastDay, anchor("2028-02-28"))).toBe(false);
    });

    it("still honors a pinned month", () => {
      expect(matchesDate(cond(DATE_CONDITION_LAST_DAY, 1, null), anchor("2026-03-31"))).toBe(false);
    });
  });

  describe("weekday of month", () => {
    it("matches the first Friday and not the second", () => {
      const firstFriday = cond({ nth: 1, weekday: 5 }, DATE_CONDITION_ANY, null);
      expect(matchesDate(firstFriday, anchor("2026-05-01"))).toBe(true);
      expect(matchesDate(firstFriday, anchor("2026-05-08"))).toBe(false);
    });

    it("matches the fourth Thursday of November", () => {
      const thanksgiving = cond({ nth: 4, weekday: 4 }, 10, null);
      expect(matchesDate(thanksgiving, anchor("2026-11-26"))).toBe(true);
      expect(matchesDate(thanksgiving, anchor("2026-11-19"))).toBe(false);
    });

    it("matches the same day for 5th and last in a month with five of that weekday", () => {
      expect(matchingDays(cond({ nth: 5, weekday: 5 }, DATE_CONDITION_ANY, null), 2026, 5)).toEqual(["2026-05-29"]);
      expect(matchingDays(cond({ nth: "last", weekday: 5 }, DATE_CONDITION_ANY, null), 2026, 5)).toEqual([
        "2026-05-29",
      ]);
    });

    it("matches nothing for a 5th weekday the month lacks, while last finds the 4th", () => {
      expect(matchingDays(cond({ nth: 5, weekday: 5 }, DATE_CONDITION_ANY, null), 2026, 4)).toEqual([]);
      expect(matchingDays(cond({ nth: "last", weekday: 5 }, DATE_CONDITION_ANY, null), 2026, 4)).toEqual([
        "2026-04-24",
      ]);
    });

    it("does not match the right ordinal on the wrong weekday", () => {
      expect(matchesDate(cond({ nth: 1, weekday: 4 }, DATE_CONDITION_ANY, null), anchor("2026-05-01"))).toBe(false);
    });

    it("works with the month wildcard", () => {
      expect(matchesDate(cond({ nth: "last", weekday: 5 }, DATE_CONDITION_ANY, null), anchor("2026-07-31"))).toBe(true);
    });
  });

  describe("dateConditionSchema", () => {
    it("accepts the wildcard sentinel for day and month", () => {
      expect(v.safeParse(dateConditionSchema, { type: "date", day: -1, month: -1, year: null }).success).toBe(true);
    });

    it("rejects a month outside 0-11", () => {
      expect(v.safeParse(dateConditionSchema, { type: "date", day: 1, month: 12, year: null }).success).toBe(false);
    });

    it("rejects a day outside 1-31", () => {
      expect(v.safeParse(dateConditionSchema, { type: "date", day: 32, month: 0, year: null }).success).toBe(false);
    });

    it("accepts the last day", () => {
      expect(v.safeParse(dateConditionSchema, { type: "date", day: "last", month: -1, year: null }).success).toBe(true);
    });

    it("accepts an ordinal weekday", () => {
      for (const day of [
        { nth: "last", weekday: 6 },
        { nth: 3, weekday: 0 },
      ]) {
        expect(v.safeParse(dateConditionSchema, { type: "date", day, month: -1, year: null }).success).toBe(true);
      }
    });

    it("rejects an ordinal or weekday out of range, and an unknown day word", () => {
      for (const day of [{ nth: 0, weekday: 1 }, { nth: 6, weekday: 1 }, { nth: 1, weekday: 7 }, "first"]) {
        expect(v.safeParse(dateConditionSchema, { type: "date", day, month: -1, year: null }).success).toBe(false);
      }
    });
  });

  describe("an older version reading a moving day", () => {
    // The schema as it shipped before moving days. Rejecting the new day values is what makes an
    // older loader drop the decoration (its condition list is `whole`) instead of reading "any day".
    const preChange = v.object({
      type: v.literal("date"),
      day: v.union([v.literal(-1), v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31))]),
      month: v.union([v.literal(-1), v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(11))]),
      year: v.nullable(v.pipe(v.number(), v.integer())),
    });

    it("rejects every moving-day value", () => {
      for (const day of ["last", { nth: 1, weekday: 5 }, { nth: "last", weekday: 5 }]) {
        expect(v.safeParse(preChange, { type: "date", day, month: -1, year: null }).success).toBe(false);
      }
    });
  });
});
