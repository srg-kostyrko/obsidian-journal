import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { Interval } from "./interval";
import { date, installTestCalendar } from "./testing";

describe("Interval", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("between", () => {
    it("returns Ok with start preserved when start <= end", () => {
      const result = Interval.between(date("2025-03-10"), date("2025-03-15"));

      expectOk(result);
      expect(result.value.start.toAnchor()).toBe("2025-03-10");
    });

    it("returns Ok with end preserved when start <= end", () => {
      const result = Interval.between(date("2025-03-10"), date("2025-03-15"));

      expectOk(result);
      expect(result.value.end.toAnchor()).toBe("2025-03-15");
    });

    it("accepts start === end as a single-day interval (Ok)", () => {
      const result = Interval.between(date("2025-03-10"), date("2025-03-10"));

      expectOk(result);
    });

    it("returns Err(IntervalError) when start > end", () => {
      const result = Interval.between(date("2025-03-15"), date("2025-03-10"));

      expectErr(result);
      expect(result.error.name).toBe("IntervalError");
    });
  });

  describe("contains", () => {
    it("returns true for the start boundary", () => {
      const interval = Interval.between(date("2025-03-10"), date("2025-03-15"));
      expectOk(interval);

      expect(interval.value.contains(date("2025-03-10"))).toBe(true);
    });

    it("returns true for a date strictly inside", () => {
      const interval = Interval.between(date("2025-03-10"), date("2025-03-15"));
      expectOk(interval);

      expect(interval.value.contains(date("2025-03-12"))).toBe(true);
    });

    it("returns true for the end boundary", () => {
      const interval = Interval.between(date("2025-03-10"), date("2025-03-15"));
      expectOk(interval);

      expect(interval.value.contains(date("2025-03-15"))).toBe(true);
    });

    it("returns false for the day before start", () => {
      const interval = Interval.between(date("2025-03-10"), date("2025-03-15"));
      expectOk(interval);

      expect(interval.value.contains(date("2025-03-09"))).toBe(false);
    });

    it("returns false for the day after end", () => {
      const interval = Interval.between(date("2025-03-10"), date("2025-03-15"));
      expectOk(interval);

      expect(interval.value.contains(date("2025-03-16"))).toBe(false);
    });
  });

  describe("isSame", () => {
    it("returns true for intervals with identical start and end", () => {
      const a = Interval.between(date("2025-03-10"), date("2025-03-15"));
      const b = Interval.between(date("2025-03-10"), date("2025-03-15"));
      expectOk(a);
      expectOk(b);

      expect(a.value.isSame(b.value)).toBe(true);
    });

    it("returns false when end differs", () => {
      const a = Interval.between(date("2025-03-10"), date("2025-03-15"));
      const b = Interval.between(date("2025-03-10"), date("2025-03-16"));
      expectOk(a);
      expectOk(b);

      expect(a.value.isSame(b.value)).toBe(false);
    });
  });

  describe("days", () => {
    it("yields every day from start to end inclusive", () => {
      const interval = Interval.between(date("2025-03-10"), date("2025-03-13"));
      expectOk(interval);

      const anchors = [...interval.value.days()].map((d) => d.toAnchor());

      expect(anchors).toEqual(["2025-03-10", "2025-03-11", "2025-03-12", "2025-03-13"]);
    });
  });
});
