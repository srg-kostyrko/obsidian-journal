import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MonthPeriod } from "./period-month";
import { date, installTestCalendar } from "./testing";

describe("MonthPeriod", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("containing", () => {
    it("starts on the first of the month", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).start.toAnchor()).toBe("2025-03-01");
    });

    it("ends on the last day of the month", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).end.toAnchor()).toBe("2025-03-31");
    });

    it("tags itself with kind 'month'", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).kind).toBe("month");
    });

    it("exposes monthOfYear as a 1-based number", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).monthOfYear).toBe(3);
    });

    it("exposes the year", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).year).toBe(2025);
    });
  });

  describe("anchor", () => {
    it("equals start", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).anchor.toAnchor()).toBe("2025-03-01");
    });
  });

  describe("navigation", () => {
    it("next yields the following month", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).next().start.toAnchor()).toBe("2025-04-01");
    });

    it("previous yields the prior month", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).previous().start.toAnchor()).toBe("2025-02-01");
    });
  });

  describe("contains", () => {
    it("returns true for the first day of the month", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).contains(date("2025-03-01"))).toBe(true);
    });

    it("returns true for the last day of the month", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).contains(date("2025-03-31"))).toBe(true);
    });

    it("returns false for the day before the month starts", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).contains(date("2025-02-28"))).toBe(false);
    });

    it("returns false for the day after the month ends", () => {
      expect(MonthPeriod.containing(date("2025-03-14")).contains(date("2025-04-01"))).toBe(false);
    });
  });

  describe("days", () => {
    it("yields one CalendarDate per day in the month", () => {
      const days = [...MonthPeriod.containing(date("2025-02-14")).days()];
      expect(days).toHaveLength(28);
      expect(days[0].toAnchor()).toBe("2025-02-01");
      expect(days[27].toAnchor()).toBe("2025-02-28");
    });
  });

  describe("weeks", () => {
    it("yields every WeekPeriod that intersects the month", () => {
      const starts = [...MonthPeriod.containing(date("2025-03-14")).weeks()].map((w) => w.start.toAnchor());
      expect(starts).toEqual(["2025-02-24", "2025-03-03", "2025-03-10", "2025-03-17", "2025-03-24", "2025-03-31"]);
    });
  });
});
