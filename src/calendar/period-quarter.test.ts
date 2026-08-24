import { describe, expect, it } from "vitest";

import { QuarterPeriod } from "./period-quarter";
import { date } from "./testing";

describe("QuarterPeriod", () => {
  describe("containing", () => {
    it("starts on the first day of the first month of the quarter", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).start.toAnchor()).toBe("2025-04-01");
    });

    it("ends on the last day of the third month of the quarter", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).end.toAnchor()).toBe("2025-06-30");
    });

    it("tags itself with kind 'quarter'", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).kind).toBe("quarter");
    });

    it("exposes quarterOfYear as 1-4", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).quarterOfYear).toBe(2);
    });

    it("exposes the year", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).year).toBe(2025);
    });
  });

  describe("anchor", () => {
    it("equals start", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).anchor.toAnchor()).toBe("2025-04-01");
    });
  });

  describe("navigation", () => {
    it("next yields the following quarter", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).next().start.toAnchor()).toBe("2025-07-01");
    });

    it("previous yields the prior quarter across year boundary", () => {
      expect(QuarterPeriod.containing(date("2025-01-15")).previous().start.toAnchor()).toBe("2024-10-01");
    });
  });

  describe("contains", () => {
    it("returns true for the first day of the quarter", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).contains(date("2025-04-01"))).toBe(true);
    });

    it("returns false for a date in the next quarter", () => {
      expect(QuarterPeriod.containing(date("2025-05-15")).contains(date("2025-07-01"))).toBe(false);
    });
  });

  describe("months", () => {
    it("yields the three MonthPeriods of the quarter", () => {
      const starts = [...QuarterPeriod.containing(date("2025-05-15")).months()].map((m) => m.start.toAnchor());
      expect(starts).toEqual(["2025-04-01", "2025-05-01", "2025-06-01"]);
    });
  });
});
