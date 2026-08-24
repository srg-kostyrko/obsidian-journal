import { describe, expect, it } from "vitest";

import { DayPeriod } from "./period-day";
import { date } from "./testing";

describe("DayPeriod", () => {
  describe("containing", () => {
    it("uses the given date as start", () => {
      expect(DayPeriod.containing(date("2025-03-14")).start.toAnchor()).toBe("2025-03-14");
    });

    it("uses the given date as end", () => {
      expect(DayPeriod.containing(date("2025-03-14")).end.toAnchor()).toBe("2025-03-14");
    });

    it("uses the given date as anchor", () => {
      expect(DayPeriod.containing(date("2025-03-14")).anchor.toAnchor()).toBe("2025-03-14");
    });

    it("tags itself with kind 'day'", () => {
      expect(DayPeriod.containing(date("2025-03-14")).kind).toBe("day");
    });
  });

  describe("navigation", () => {
    it("next yields the following calendar day", () => {
      expect(DayPeriod.containing(date("2025-03-14")).next().anchor.toAnchor()).toBe("2025-03-15");
    });

    it("previous yields the prior calendar day", () => {
      expect(DayPeriod.containing(date("2025-03-14")).previous().anchor.toAnchor()).toBe("2025-03-13");
    });
  });

  describe("contains", () => {
    it("returns true for the day itself", () => {
      expect(DayPeriod.containing(date("2025-03-14")).contains(date("2025-03-14"))).toBe(true);
    });

    it("returns false for any other date", () => {
      expect(DayPeriod.containing(date("2025-03-14")).contains(date("2025-03-15"))).toBe(false);
    });
  });

  describe("isSame", () => {
    it("returns true for the same day", () => {
      expect(DayPeriod.containing(date("2025-03-14")).isSame(DayPeriod.containing(date("2025-03-14")))).toBe(true);
    });

    it("returns false for different days", () => {
      expect(DayPeriod.containing(date("2025-03-14")).isSame(DayPeriod.containing(date("2025-03-15")))).toBe(false);
    });
  });

  describe("days", () => {
    it("yields exactly one CalendarDate equal to the day", () => {
      const days = [...DayPeriod.containing(date("2025-03-14")).days()];
      expect(days).toHaveLength(1);
      expect(days[0].toAnchor()).toBe("2025-03-14");
    });
  });

  describe("format", () => {
    it("formats against the anchor date", () => {
      expect(DayPeriod.containing(date("2025-03-14")).format("DD/MM/YYYY")).toBe("14/03/2025");
    });
  });
});
