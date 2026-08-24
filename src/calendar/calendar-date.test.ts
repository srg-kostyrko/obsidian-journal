import { describe, expect, expectTypeOf, it } from "vitest";

import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { CalendarDate } from "./calendar-date";
import { anchor } from "./testing";

import type { AnchorString } from "./types";

describe("CalendarDate", () => {
  describe("today", () => {
    it("returns a CalendarDate whose anchor matches the current local date", () => {
      const today = CalendarDate.today();
      const expected = new Date();
      const yyyy = String(expected.getFullYear()).padStart(4, "0");
      const mm = String(expected.getMonth() + 1).padStart(2, "0");
      const dd = String(expected.getDate()).padStart(2, "0");

      expect(today.toAnchor()).toBe(`${yyyy}-${mm}-${dd}`);
    });
  });

  describe("parse", () => {
    it("parses an ISO YYYY-MM-DD string into a CalendarDate", () => {
      const result = CalendarDate.parse("2025-03-14");

      expectOk(result);
      expect(result.value.toAnchor()).toBe("2025-03-14");
    });

    it("uses the provided format when given", () => {
      const result = CalendarDate.parse("14/03/2025", "DD/MM/YYYY");

      expectOk(result);
      expect(result.value.toAnchor()).toBe("2025-03-14");
    });

    it("returns ParseError on a malformed ISO string", () => {
      const result = CalendarDate.parse("not-a-date");

      expectErr(result);
      expect(result.error.input).toBe("not-a-date");
    });

    it("returns ParseError when the input does not match the supplied format", () => {
      const result = CalendarDate.parse("2025-03-14", "DD/MM/YYYY");

      expectErr(result);
      expect(result.error.format).toBe("DD/MM/YYYY");
    });
  });

  describe("fromAnchor", () => {
    it("rebuilds a CalendarDate from its anchor string", () => {
      const original = anchor("2025-03-14");

      const rebuilt = CalendarDate.fromAnchor(original);

      expect(rebuilt.toAnchor()).toBe("2025-03-14");
    });
  });

  describe("field projection", () => {
    it("exposes the calendar year", () => {
      const result = CalendarDate.parse("2025-03-14");
      expectOk(result);

      expect(result.value.year).toBe(2025);
    });

    it("exposes the month as a 1-based number", () => {
      const result = CalendarDate.parse("2025-03-14");
      expectOk(result);

      expect(result.value.month).toBe(3);
    });

    it("exposes the day as a 1-based number", () => {
      const result = CalendarDate.parse("2025-03-14");
      expectOk(result);

      expect(result.value.day).toBe(14);
    });
  });

  describe("format", () => {
    it("formats with arbitrary moment patterns", () => {
      const result = CalendarDate.parse("2025-03-14");
      expectOk(result);

      expect(result.value.format("dddd")).toBe("Friday");
    });
  });

  describe("comparison", () => {
    it("isBefore is true for an earlier date", () => {
      const earlier = CalendarDate.fromAnchor(anchor("2025-03-13"));
      const later = CalendarDate.fromAnchor(anchor("2025-03-14"));

      expect(earlier.isBefore(later)).toBe(true);
    });

    it("isAfter is true for a later date", () => {
      const earlier = CalendarDate.fromAnchor(anchor("2025-03-13"));
      const later = CalendarDate.fromAnchor(anchor("2025-03-14"));

      expect(later.isAfter(earlier)).toBe(true);
    });

    it("isSame is true for equal anchors", () => {
      const a = CalendarDate.fromAnchor(anchor("2025-03-14"));
      const b = CalendarDate.fromAnchor(anchor("2025-03-14"));

      expect(a.isSame(b)).toBe(true);
    });

    it("orders an earlier date before a later one", () => {
      const earlier = CalendarDate.fromAnchor(anchor("2025-03-13"));
      const later = CalendarDate.fromAnchor(anchor("2025-03-14"));

      expect(earlier.compareTo(later)).toBe(-1);
    });

    it("orders a later date after an earlier one", () => {
      const earlier = CalendarDate.fromAnchor(anchor("2025-03-13"));
      const later = CalendarDate.fromAnchor(anchor("2025-03-14"));

      expect(later.compareTo(earlier)).toBe(1);
    });

    it("returns zero for equal dates", () => {
      const date = CalendarDate.fromAnchor(anchor("2025-03-14"));

      expect(date.compareTo(date)).toBe(0);
    });
  });

  describe("shift", () => {
    it("adds days", () => {
      const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(1, "d");
      expect(result.toAnchor()).toBe("2022-01-02");
    });

    it("subtracts days", () => {
      const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(-1, "d");
      expect(result.toAnchor()).toBe("2021-12-31");
    });

    it.each([
      ["w", 1, "2022-01-08"],
      ["w", -1, "2021-12-25"],
      ["m", 1, "2022-02-01"],
      ["m", -1, "2021-12-01"],
      ["q", 1, "2022-04-01"],
      ["q", -1, "2021-10-01"],
      ["y", 1, "2023-01-01"],
      ["y", -1, "2021-01-01"],
    ] as const)("shifts the date by %i %s", (unit, amount, expected) => {
      const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(amount, unit);
      expect(result.toAnchor()).toBe(expected);
    });

    it("is a no-op when unit is h", () => {
      const result = CalendarDate.fromAnchor(anchor("2022-01-01")).shift(5, "h");
      expect(result.toAnchor()).toBe("2022-01-01");
    });
  });

  describe("startOf", () => {
    it.each([
      ["week", "2022-01-05", "2022-01-03"],
      ["month", "2022-01-04", "2022-01-01"],
      ["quarter", "2022-01-04", "2022-01-01"],
      ["year", "2022-01-04", "2022-01-01"],
      ["decade", "2022-01-04", "2020-01-01"],
      ["decade", "2020-06-15", "2020-01-01"],
      ["decade", "2029-06-15", "2020-01-01"],
      ["day", "2022-01-04", "2022-01-04"],
    ] as const)("snaps to start of %s", (unit, input, expected) => {
      const result = CalendarDate.fromAnchor(anchor(input)).startOf(unit);
      expect(result.toAnchor()).toBe(expected);
    });
  });

  describe("endOf", () => {
    it.each([
      ["week", "2022-01-05", "2022-01-09"],
      ["month", "2022-01-04", "2022-01-31"],
      ["quarter", "2022-01-04", "2022-03-31"],
      ["year", "2022-01-04", "2022-12-31"],
      ["decade", "2022-01-04", "2029-12-31"],
      ["decade", "2020-06-15", "2029-12-31"],
      ["decade", "2029-06-15", "2029-12-31"],
      ["day", "2022-01-04", "2022-01-04"],
    ] as const)("snaps to end of %s", (unit, input, expected) => {
      const result = CalendarDate.fromAnchor(anchor(input)).endOf(unit);
      expect(result.toAnchor()).toBe(expected);
    });
  });

  describe("AnchorString brand", () => {
    it("toAnchor returns an AnchorString-typed value", () => {
      const date = CalendarDate.fromAnchor(anchor("2025-03-14"));

      expectTypeOf(date.toAnchor()).toEqualTypeOf<AnchorString>();
    });

    it("a plain string is not assignable to AnchorString", () => {
      expectTypeOf<string>().not.toExtend<AnchorString>();
    });
  });
});
