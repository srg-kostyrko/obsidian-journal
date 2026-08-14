import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";

import {
  DATE_CONDITION_ANY,
  dateConditionSchema,
  matchesDate,
  type JournalDecorationDateCondition,
} from "./date-condition";

const anchor = (iso: string): CalendarDate => CalendarDate.fromAnchor(iso as AnchorString);

const cond = (day: number, month: number, year: number | null): JournalDecorationDateCondition => ({
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
  });
});
