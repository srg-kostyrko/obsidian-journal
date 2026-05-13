import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { YearPeriod } from "./period-year";
import { date, installTestCalendar } from "./testing";

describe("YearPeriod", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("containing", () => {
    it("starts on January 1", () => {
      expect(YearPeriod.containing(date("2025-05-15")).start.toAnchor()).toBe("2025-01-01");
    });

    it("ends on December 31", () => {
      expect(YearPeriod.containing(date("2025-05-15")).end.toAnchor()).toBe("2025-12-31");
    });

    it("tags itself with kind 'year'", () => {
      expect(YearPeriod.containing(date("2025-05-15")).kind).toBe("year");
    });

    it("exposes the year", () => {
      expect(YearPeriod.containing(date("2025-05-15")).year).toBe(2025);
    });
  });

  describe("anchor", () => {
    it("equals start (January 1)", () => {
      expect(YearPeriod.containing(date("2025-05-15")).anchor.toAnchor()).toBe("2025-01-01");
    });
  });

  describe("navigation", () => {
    it("next yields the following year", () => {
      expect(YearPeriod.containing(date("2025-05-15")).next().start.toAnchor()).toBe("2026-01-01");
    });

    it("previous yields the prior year", () => {
      expect(YearPeriod.containing(date("2025-05-15")).previous().start.toAnchor()).toBe("2024-01-01");
    });
  });

  describe("quarters", () => {
    it("yields four QuarterPeriods of the year", () => {
      const starts = [...YearPeriod.containing(date("2025-05-15")).quarters()].map((q) => q.start.toAnchor());
      expect(starts).toEqual(["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01"]);
    });
  });

  describe("months", () => {
    it("yields twelve MonthPeriods", () => {
      expect([...YearPeriod.containing(date("2025-05-15")).months()]).toHaveLength(12);
    });

    it("starts the months iteration on January", () => {
      expect([...YearPeriod.containing(date("2025-05-15")).months()][0].start.toAnchor()).toBe("2025-01-01");
    });

    it("ends the months iteration on December", () => {
      expect([...YearPeriod.containing(date("2025-05-15")).months()][11].start.toAnchor()).toBe("2025-12-01");
    });
  });
});
