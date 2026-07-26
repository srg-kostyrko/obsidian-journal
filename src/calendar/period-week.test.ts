import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WeekPeriod } from "./period-week";
import { date, installTestCalendar } from "./testing";

describe("WeekPeriod", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("containing", () => {
    it("spans Monday to start", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).start.toAnchor()).toBe("2025-03-10");
    });

    it("spans Monday to end", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).end.toAnchor()).toBe("2025-03-16");
    });

    it("tags itself with kind 'week'", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).kind).toBe("week");
    });

    it("exposes the ISO 8601 week-of-year", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).weekOfYear).toBe(11);
    });
  });

  describe("anchor", () => {
    it("is the Thursday inside the week under ISO 8601", () => {
      expect(WeekPeriod.containing(date("2025-03-10")).anchor.toAnchor()).toBe("2025-03-13");
    });
  });

  describe("representative", () => {
    it("is the Thursday inside the week under ISO 8601", () => {
      expect(WeekPeriod.containing(date("2025-03-10")).representative.toAnchor()).toBe("2025-03-13");
    });

    it("is the Friday inside a Sunday-start week under dow=0, doy=6", () => {
      teardown();
      ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

      expect(WeekPeriod.containing(date("2025-03-14")).representative.toAnchor()).toBe("2025-03-14");
    });
  });

  describe("year", () => {
    it("returns the calendar year for a fully-in-year week", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).year).toBe(2025);
    });

    it("returns the owning year (Thursday's year) for a week spanning Dec→Jan, with start before Jan 1", () => {
      expect(WeekPeriod.containing(date("2024-12-31")).start.toAnchor()).toBe("2024-12-30");
    });

    it("exposes end after Dec 31 for that cross-year week", () => {
      expect(WeekPeriod.containing(date("2024-12-31")).end.toAnchor()).toBe("2025-01-05");
    });

    it("anchor is the Thursday inside the cross-year week", () => {
      expect(WeekPeriod.containing(date("2024-12-31")).anchor.toAnchor()).toBe("2025-01-02");
    });

    it("year is the locale-owning year for the cross-year week", () => {
      expect(WeekPeriod.containing(date("2024-12-31")).year).toBe(2025);
    });

    it("anchor.format('YYYY') matches year for the same cross-year week", () => {
      expect(WeekPeriod.containing(date("2024-12-31")).anchor.format("YYYY")).toBe("2025");
    });
  });

  describe("navigation", () => {
    it("next yields the following week", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).next().start.toAnchor()).toBe("2025-03-17");
    });

    it("previous yields the prior week", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).previous().start.toAnchor()).toBe("2025-03-03");
    });

    it("steps back onto ISO week 53 at a 53-week year boundary", () => {
      // 2026 is a 53-week ISO year (W53 = Mon 2026-12-28–Sun 2027-01-03). Stepping back from
      // 2027-W01 must land on W53, not skip straight to W52.
      expect(WeekPeriod.containing(date("2027-01-04")).previous().weekOfYear).toBe(53);
    });

    it("reaches week 52 only after week 53 when stepping back across the boundary", () => {
      expect(WeekPeriod.containing(date("2027-01-04")).previous().previous().weekOfYear).toBe(52);
    });
  });

  describe("contains", () => {
    it("returns true for the Monday boundary", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).contains(date("2025-03-10"))).toBe(true);
    });

    it("returns true for the Sunday boundary", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).contains(date("2025-03-16"))).toBe(true);
    });

    it("returns false for the day before the week starts", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).contains(date("2025-03-09"))).toBe(false);
    });

    it("returns false for the day after the week ends", () => {
      expect(WeekPeriod.containing(date("2025-03-14")).contains(date("2025-03-17"))).toBe(false);
    });
  });

  describe("isSame", () => {
    it("returns true when both weeks contain the same dates", () => {
      expect(WeekPeriod.containing(date("2025-03-10")).isSame(WeekPeriod.containing(date("2025-03-16")))).toBe(true);
    });
  });

  describe("days", () => {
    it("yields seven CalendarDates from Monday to Sunday inclusive", () => {
      const anchors = [...WeekPeriod.containing(date("2025-03-14")).days()].map((d) => d.toAnchor());
      expect(anchors).toEqual([
        "2025-03-10",
        "2025-03-11",
        "2025-03-12",
        "2025-03-13",
        "2025-03-14",
        "2025-03-15",
        "2025-03-16",
      ]);
    });
  });

  describe("format", () => {
    it("formats against the anchor (Thursday)", () => {
      expect(WeekPeriod.containing(date("2024-12-31")).format("GGGG-[W]WW")).toBe("2025-W01");
    });
  });

  describe("non-ISO locale", () => {
    it("uses Sunday-start week when configured with dow=0", () => {
      teardown();
      ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

      expect(WeekPeriod.containing(date("2025-03-14")).start.toAnchor()).toBe("2025-03-09");
    });

    it("ends Saturday when Sunday-start", () => {
      teardown();
      ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

      expect(WeekPeriod.containing(date("2025-03-14")).end.toAnchor()).toBe("2025-03-15");
    });

    it("anchor is the Friday for a Sun-start week under dow=0, doy=6", () => {
      teardown();
      ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

      expect(WeekPeriod.containing(date("2025-03-14")).anchor.toAnchor()).toBe("2025-03-14");
    });

    it("year returns owning year for a cross-year week under dow=0, doy=6", () => {
      teardown();
      ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

      // Week containing 2025-12-31: starts Sun 2025-12-28, ends Sat 2026-01-03,
      // owning day (Friday) is 2026-01-02 → owning year is 2026.
      expect(WeekPeriod.containing(date("2025-12-31")).year).toBe(2026);
    });

    it("anchor.year matches year for the cross-year week under dow=0, doy=6", () => {
      teardown();
      ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));

      const week = WeekPeriod.containing(date("2025-12-31"));

      expect(week.anchor.year).toBe(week.year);
    });
  });
});
