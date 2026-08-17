import { describe, expect, it } from "vitest";

import { formatToRegexp } from "./format-regex";

describe("formatToRegexp", () => {
  describe("year tokens", () => {
    it("matches a 4-digit year for YYYY", () => {
      expect(formatToRegexp("YYYY").test("2025")).toBe(true);
    });

    it("rejects a 2-digit year for YYYY", () => {
      expect(formatToRegexp("YYYY").test("25")).toBe(false);
    });

    it("matches a 2-digit year for YY", () => {
      expect(formatToRegexp("YY").test("25")).toBe(true);
    });
  });

  describe("month tokens", () => {
    it("matches a 1-2 digit month for M", () => {
      expect(formatToRegexp("M").test("9")).toBe(true);
    });

    it("matches a 2-digit month for MM", () => {
      expect(formatToRegexp("MM").test("09")).toBe(true);
    });

    it("rejects a 1-digit month for MM", () => {
      const re = new RegExp(`^${formatToRegexp("MM").source}$`);
      expect(re.test("9")).toBe(false);
    });
  });

  describe("day-of-month tokens", () => {
    it("matches a 1-2 digit day for D", () => {
      expect(formatToRegexp("D").test("3")).toBe(true);
    });

    it("matches a 2-digit day for DD", () => {
      expect(formatToRegexp("DD").test("03")).toBe(true);
    });
  });

  describe("ordinal token", () => {
    it("matches an ordinal day for Do", () => {
      const re = new RegExp(`^${formatToRegexp("Do").source}$`);
      expect(re.test("3rd")).toBe(true);
      expect(re.test("1st")).toBe(true);
    });
  });

  describe("quarter token", () => {
    it("matches a quarter digit for Q", () => {
      expect(formatToRegexp("Q").test("3")).toBe(true);
    });

    it("rejects 0 for Q", () => {
      const re = new RegExp(`^${formatToRegexp("Q").source}$`);
      expect(re.test("0")).toBe(false);
    });
  });

  describe("week tokens", () => {
    it("matches a 1-2 digit ISO week for w", () => {
      expect(formatToRegexp("w").test("42")).toBe(true);
    });

    it("matches a 2-digit ISO week for ww", () => {
      expect(formatToRegexp("ww").test("03")).toBe(true);
    });

    it("matches a 1-2 digit locale week for W", () => {
      expect(formatToRegexp("W").test("42")).toBe(true);
    });

    it("matches a 2-digit locale week for WW", () => {
      expect(formatToRegexp("WW").test("03")).toBe(true);
    });
  });

  describe("combined formats", () => {
    it("matches dates in YYYY-MM-DD format", () => {
      expect(formatToRegexp("YYYY-MM-DD").test("2025-03-14")).toBe(true);
    });

    it("rejects strings outside YYYY-MM-DD format", () => {
      const re = new RegExp(`^${formatToRegexp("YYYY-MM-DD").source}$`);
      expect(re.test("25-3-1")).toBe(false);
    });

    it("matches week notation with a literal W prefix", () => {
      expect(formatToRegexp("YYYY-[W]w").test("2025-W42")).toBe(true);
    });
  });

  describe("literal brackets", () => {
    it("matches arbitrary text inside square brackets verbatim", () => {
      expect(formatToRegexp("[journal-]YYYY").test("journal-2025")).toBe(true);
    });

    it("regex-escapes characters inside square brackets", () => {
      expect(formatToRegexp("[a.b]YYYY").test("a.b2025")).toBe(true);
      const re = new RegExp(`^${formatToRegexp("[a.b]YYYY").source}$`);
      expect(re.test("aXb2025")).toBe(false);
    });
  });

  describe("day-of-year tokens", () => {
    it("matches a 1-3 digit day of year for DDD", () => {
      const re = new RegExp(`^${formatToRegexp("DDD").source}$`);
      expect(re.test("5")).toBe(true);
      expect(re.test("100")).toBe(true);
      expect(re.test("366")).toBe(true);
    });

    it("matches a zero-padded day of year for DDDD", () => {
      const re = new RegExp(`^${formatToRegexp("DDDD").source}$`);
      expect(re.test("003")).toBe(true);
      expect(re.test("100")).toBe(true);
    });

    it("rejects a day of year with too few digits for DDDD", () => {
      const re = new RegExp(`^${formatToRegexp("DDDD").source}$`);
      expect(re.test("03")).toBe(false);
    });
  });
});
