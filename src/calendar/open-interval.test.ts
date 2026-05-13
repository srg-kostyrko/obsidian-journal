import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { OpenInterval } from "./open-interval";
import { date, installTestCalendar } from "./testing";

describe("OpenInterval", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("from", () => {
    it("creates an interval with Some start", () => {
      expect(OpenInterval.from(date("2025-03-10")).start.isSome()).toBe(true);
    });

    it("creates an interval with None end", () => {
      expect(OpenInterval.from(date("2025-03-10")).end.isNone()).toBe(true);
    });

    it("preserves the start CalendarDate in Some", () => {
      const interval = OpenInterval.from(date("2025-03-10"));

      expect(interval.start.getOr(date("1970-01-01")).toAnchor()).toBe("2025-03-10");
    });
  });

  describe("until", () => {
    it("creates an interval with None start", () => {
      expect(OpenInterval.until(date("2025-03-10")).start.isNone()).toBe(true);
    });

    it("creates an interval with Some end", () => {
      expect(OpenInterval.until(date("2025-03-10")).end.isSome()).toBe(true);
    });

    it("preserves the end CalendarDate in Some", () => {
      const interval = OpenInterval.until(date("2025-03-10"));

      expect(interval.end.getOr(date("1970-01-01")).toAnchor()).toBe("2025-03-10");
    });
  });

  describe("between", () => {
    it("returns Ok with Some start when start <= end", () => {
      const result = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));

      expectOk(result);
      expect(result.value.start.isSome()).toBe(true);
    });

    it("returns Ok with Some end when start <= end", () => {
      const result = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));

      expectOk(result);
      expect(result.value.end.isSome()).toBe(true);
    });

    it("returns Err when start > end", () => {
      const result = OpenInterval.between(date("2025-03-14"), date("2025-03-10"));

      expectErr(result);
    });
  });

  describe("contains with both bounds", () => {
    it("returns true for a date inside the range", () => {
      const result = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));
      expectOk(result);

      expect(result.value.contains(date("2025-03-12"))).toBe(true);
    });

    it("returns false for a date before the range", () => {
      const result = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));
      expectOk(result);

      expect(result.value.contains(date("2025-03-09"))).toBe(false);
    });
  });

  describe("contains with open end (from)", () => {
    it("returns true for the start boundary", () => {
      expect(OpenInterval.from(date("2025-03-10")).contains(date("2025-03-10"))).toBe(true);
    });

    it("returns true for any date far in the future", () => {
      expect(OpenInterval.from(date("2025-03-10")).contains(date("2099-12-31"))).toBe(true);
    });

    it("returns false for a date before start", () => {
      expect(OpenInterval.from(date("2025-03-10")).contains(date("2025-03-09"))).toBe(false);
    });
  });

  describe("contains with open start (until)", () => {
    it("returns true for the end boundary", () => {
      expect(OpenInterval.until(date("2025-03-10")).contains(date("2025-03-10"))).toBe(true);
    });

    it("returns true for any date far in the past", () => {
      expect(OpenInterval.until(date("2025-03-10")).contains(date("1900-01-01"))).toBe(true);
    });

    it("returns false for a date after end", () => {
      expect(OpenInterval.until(date("2025-03-10")).contains(date("2025-03-11"))).toBe(false);
    });
  });

  describe("isSame", () => {
    it("returns true for two from() intervals with the same start", () => {
      const a = OpenInterval.from(date("2025-03-10"));
      const b = OpenInterval.from(date("2025-03-10"));

      expect(a.isSame(b)).toBe(true);
    });

    it("returns false when bounds presence differs", () => {
      const closed = OpenInterval.between(date("2025-03-10"), date("2025-03-14"));
      const halfOpen = OpenInterval.from(date("2025-03-10"));
      expectOk(closed);

      expect(closed.value.isSame(halfOpen)).toBe(false);
    });
  });
});
