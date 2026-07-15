import { beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";

import { relativeDate } from "./relative-date";

import type { AnchorString } from "./types";

const anchor = (s: string): AnchorString => s as AnchorString;

describe("relativeDate", () => {
  beforeAll(() => initLocale("en"));

  describe("week", () => {
    it("returns 'This week' when anchor is in the same week as today", () => {
      expect(relativeDate("week", anchor("2026-05-27"), anchor("2026-05-29"))).toBe("This week");
    });

    it("returns 'Last week' for the immediately previous week", () => {
      expect(relativeDate("week", anchor("2026-05-20"), anchor("2026-05-27"))).toBe("Last week");
    });

    it("returns 'Next week' for the immediately following week", () => {
      expect(relativeDate("week", anchor("2026-06-03"), anchor("2026-05-27"))).toBe("Next week");
    });

    it("returns 'N weeks ago' for anchors more than one week in the past", () => {
      expect(relativeDate("week", anchor("2026-05-06"), anchor("2026-05-27"))).toBe("3 weeks ago");
    });

    it("returns 'N weeks from now' for anchors more than one week in the future", () => {
      expect(relativeDate("week", anchor("2026-06-17"), anchor("2026-05-27"))).toBe("3 weeks from now");
    });
  });

  describe("month", () => {
    it("returns 'This month' for same month", () => {
      expect(relativeDate("month", anchor("2026-05-01"), anchor("2026-05-27"))).toBe("This month");
    });
    it("returns 'Last month'", () => {
      expect(relativeDate("month", anchor("2026-04-15"), anchor("2026-05-27"))).toBe("Last month");
    });
    it("returns 'Next month'", () => {
      expect(relativeDate("month", anchor("2026-06-15"), anchor("2026-05-27"))).toBe("Next month");
    });
    it("returns 'N months ago'", () => {
      expect(relativeDate("month", anchor("2026-01-15"), anchor("2026-05-27"))).toBe("4 months ago");
    });
    it("returns 'N months from now'", () => {
      expect(relativeDate("month", anchor("2026-09-15"), anchor("2026-05-27"))).toBe("4 months from now");
    });
  });

  describe("quarter", () => {
    it("returns 'This quarter' for same quarter", () => {
      expect(relativeDate("quarter", anchor("2026-04-01"), anchor("2026-05-27"))).toBe("This quarter");
    });
    it("returns 'Last quarter'", () => {
      expect(relativeDate("quarter", anchor("2026-02-01"), anchor("2026-05-27"))).toBe("Last quarter");
    });
    it("returns 'Next quarter'", () => {
      expect(relativeDate("quarter", anchor("2026-08-01"), anchor("2026-05-27"))).toBe("Next quarter");
    });
    it("returns 'N quarters ago'", () => {
      expect(relativeDate("quarter", anchor("2025-08-01"), anchor("2026-05-27"))).toBe("3 quarters ago");
    });
    it("returns 'N quarters from now'", () => {
      expect(relativeDate("quarter", anchor("2027-02-01"), anchor("2026-05-27"))).toBe("3 quarters from now");
    });
  });

  describe("day", () => {
    it("returns 'Today' when anchor equals today", () => {
      expect(relativeDate("day", anchor("2026-05-27"), anchor("2026-05-27"))).toBe("Today");
    });
    it("returns 'Yesterday' for the immediately previous day", () => {
      expect(relativeDate("day", anchor("2026-05-26"), anchor("2026-05-27"))).toBe("Yesterday");
    });
    it("returns 'Tomorrow' for the immediately following day", () => {
      expect(relativeDate("day", anchor("2026-05-28"), anchor("2026-05-27"))).toBe("Tomorrow");
    });
    it("returns 'Last <weekday>' for a day 2-6 days in the past", () => {
      expect(relativeDate("day", anchor("2026-05-22"), anchor("2026-05-27"))).toBe("Last Friday");
    });
    it("returns '<weekday>' for a day 2-6 days in the future", () => {
      expect(relativeDate("day", anchor("2026-05-30"), anchor("2026-05-27"))).toBe("Saturday");
    });
    it("returns 'N days ago' for a day exactly a week in the past", () => {
      // v2 bucketed ±7 days into the day-count phrasing, not the named-weekday window.
      expect(relativeDate("day", anchor("2026-05-20"), anchor("2026-05-27"))).toBe("7 days ago");
    });
    it("returns 'in N days' for a day exactly a week in the future", () => {
      expect(relativeDate("day", anchor("2026-06-03"), anchor("2026-05-27"))).toBe("in 7 days");
    });
  });

  describe("year", () => {
    it("returns 'This year' for same year", () => {
      expect(relativeDate("year", anchor("2026-01-15"), anchor("2026-05-27"))).toBe("This year");
    });
    it("returns 'Last year'", () => {
      expect(relativeDate("year", anchor("2025-08-15"), anchor("2026-05-27"))).toBe("Last year");
    });
    it("returns 'Next year'", () => {
      expect(relativeDate("year", anchor("2027-02-01"), anchor("2026-05-27"))).toBe("Next year");
    });
    it("returns 'N years ago'", () => {
      expect(relativeDate("year", anchor("2023-08-15"), anchor("2026-05-27"))).toBe("3 years ago");
    });
    it("returns 'N years from now'", () => {
      expect(relativeDate("year", anchor("2029-02-01"), anchor("2026-05-27"))).toBe("3 years from now");
    });
  });
});
