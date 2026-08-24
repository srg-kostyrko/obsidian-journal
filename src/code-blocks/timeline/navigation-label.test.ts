import { describe, expect, it } from "vitest";

import { MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod, window } from "@/calendar";
import { date } from "@/calendar/testing";

import { navigationLabel } from "./navigation-label";

describe("navigationLabel", () => {
  describe("a single period", () => {
    it("names a week with its week-year", () => {
      const week = WeekPeriod.containing(date("2026-08-27"));
      expect(navigationLabel([week])).toBe("W35 2026");
    });

    it("names a month with its year", () => {
      expect(navigationLabel([MonthPeriod.containing(date("2026-09-15"))])).toBe("September 2026");
    });

    it("names a quarter with its year", () => {
      expect(navigationLabel([QuarterPeriod.containing(date("2026-09-15"))])).toBe("Q3 2026");
    });

    it("names a year", () => {
      expect(navigationLabel([YearPeriod.containing(date("2026-09-15"))])).toBe("2026");
    });
  });

  describe("a range within one year", () => {
    it("prints the year once, after the last week", () => {
      const weeks = window(WeekPeriod.containing(date("2026-08-27")), 1, 1);
      expect(navigationLabel(weeks)).toBe("W34 – W36 2026");
    });

    it("prints the year once, after the last month", () => {
      const months = window(MonthPeriod.containing(date("2026-09-15")), 1, 1);
      expect(navigationLabel(months)).toBe("August – October 2026");
    });
  });

  describe("a range crossing a year", () => {
    it("prints both week-years", () => {
      const weeks = window(WeekPeriod.containing(date("2026-12-30")), 1, 1);
      expect(navigationLabel(weeks)).toBe("W52 2026 – W1 2027");
    });

    it("prints both years for months", () => {
      const months = window(MonthPeriod.containing(date("2027-01-15")), 1, 1);
      expect(navigationLabel(months)).toBe("December 2026 – February 2027");
    });
  });
});
