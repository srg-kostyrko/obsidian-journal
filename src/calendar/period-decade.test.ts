import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DecadePeriod } from "./period-decade";
import { date, installTestCalendar } from "./testing";

describe("DecadePeriod", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("containing", () => {
    it("starts on January 1 of the floor-of-10 year", () => {
      expect(DecadePeriod.containing(date("2025-05-15")).start.toAnchor()).toBe("2020-01-01");
    });

    it("ends on December 31 nine years later", () => {
      expect(DecadePeriod.containing(date("2025-05-15")).end.toAnchor()).toBe("2029-12-31");
    });

    it("tags itself with kind 'decade'", () => {
      expect(DecadePeriod.containing(date("2025-05-15")).kind).toBe("decade");
    });

    it("exposes decadeStart for a mid-decade date", () => {
      expect(DecadePeriod.containing(date("2025-05-15")).decadeStart).toBe(2020);
    });

    it("exposes decadeStart for the last day of the decade", () => {
      expect(DecadePeriod.containing(date("2029-12-31")).decadeStart).toBe(2020);
    });

    it("rolls decadeStart over on the first day of the next decade", () => {
      expect(DecadePeriod.containing(date("2030-01-01")).decadeStart).toBe(2030);
    });
  });

  describe("anchor", () => {
    it("equals start (January 1 of the decade start)", () => {
      expect(DecadePeriod.containing(date("2025-05-15")).anchor.toAnchor()).toBe("2020-01-01");
    });
  });

  describe("navigation", () => {
    it("next yields the following decade", () => {
      expect(DecadePeriod.containing(date("2025-05-15")).next().start.toAnchor()).toBe("2030-01-01");
    });

    it("previous yields the prior decade", () => {
      expect(DecadePeriod.containing(date("2025-05-15")).previous().start.toAnchor()).toBe("2010-01-01");
    });
  });

  describe("years", () => {
    it("yields ten YearPeriods of the decade", () => {
      const starts = [...DecadePeriod.containing(date("2025-05-15")).years()].map((y) => y.year);
      expect(starts).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029]);
    });
  });
});
