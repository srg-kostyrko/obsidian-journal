import { describe, expect, it } from "vitest";

import { localMoment } from "@/calendar";

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

  // A localized format is a shorthand the locale expands; the pattern has to see the tokens
  // underneath it, or a name written with one matches nothing. The expansion is the locale's own, so
  // these assert the shape rather than the exact separators.
  describe("localized formats", () => {
    it("matches the date L renders", () => {
      expect(formatToRegexp("L").test(localMoment("2025-09-16", "YYYY-MM-DD", true).format("L"))).toBe(true);
    });

    it("matches the date LL renders", () => {
      expect(formatToRegexp("LL").test(localMoment("2025-09-16", "YYYY-MM-DD", true).format("LL"))).toBe(true);
    });

    it("matches the date ll renders", () => {
      expect(formatToRegexp("ll").test(localMoment("2025-09-16", "YYYY-MM-DD", true).format("ll"))).toBe(true);
    });

    it("leaves a localized token inside brackets as the user's own text", () => {
      expect(formatToRegexp("[LL] YYYY").test("LL 2025")).toBe(true);
    });
  });

  // An epoch stamp is neither fixed-width nor unsigned, and a pattern pinned to today's width
  // rejects the very dates a journal reaches back over.
  describe("epoch tokens", () => {
    it("matches a present-day stamp for X", () => {
      expect(formatToRegexp("X").test("1641333600")).toBe(true);
    });

    it("matches a present-day stamp for x", () => {
      expect(formatToRegexp("x").test("1641333600000")).toBe(true);
    });

    it("matches a stamp from before September 2001, which is a digit shorter", () => {
      expect(formatToRegexp("X").test("915141600")).toBe(true);
    });

    it("matches a stamp from before 1970, which is negative", () => {
      expect(formatToRegexp("X").test("-301287600")).toBe(true);
    });

    it("rejects text where a stamp belongs", () => {
      expect(formatToRegexp("X").test("yesterday")).toBe(false);
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

  describe("week-year tokens", () => {
    it.each(["gggg", "GGGG"])("matches a 4-digit week-year for %s", (format) => {
      const re = new RegExp(`^${formatToRegexp(format).source}$`);
      expect(re.test("2026")).toBe(true);
      expect(re.test("26")).toBe(false);
    });

    it.each(["gg", "GG"])("matches a 2-digit week-year for %s", (format) => {
      const re = new RegExp(`^${formatToRegexp(format).source}$`);
      expect(re.test("26")).toBe(true);
      expect(re.test("2026")).toBe(false);
    });

    it("matches the Periodic Notes default weekly format", () => {
      const re = new RegExp(`^${formatToRegexp("gggg-[W]ww").source}$`);
      expect(re.test("2026-W03")).toBe(true);
    });
  });

  // A date carries no time, but a property an importer wrote does, and a name rendered with one
  // holds midnight -- either way the format has to match what it renders.
  describe("time-of-day tokens", () => {
    it.each([
      "HH:mm",
      "H:mm",
      "hh:mm A",
      "h:mm a",
      "kk:mm",
      "k:mm",
      "HH:mm:ss",
      "H:m:s",
      "HH:mm:ss.SSS",
      "HH:mm:ss.S",
      "YYYY-MM-DDTHH:mm",
      "YYYY-MM-DD[T]HH:mm",
      "LT",
      "LTS",
      "LLL",
      "llll",
    ])("matches what %s renders, whole", (format) => {
      const re = new RegExp(`^${formatToRegexp(format).source}$`);
      for (const time of ["00:00:00.000", "09:05:07.004", "12:30:00.500", "23:59:59.999"]) {
        expect(re.test(localMoment(`2026-06-01 ${time}`, "YYYY-MM-DD HH:mm:ss.SSS", true).format(format))).toBe(true);
      }
    });

    it("rejects an hour where HH wants two digits", () => {
      expect(new RegExp(`^${formatToRegexp("HH:mm").source}$`).test("9:05")).toBe(false);
    });

    it("no longer reads the time symbols as literal letters", () => {
      expect(new RegExp(`^${formatToRegexp("HH:mm").source}$`).test("HH:mm")).toBe(false);
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

    it("finds a date embedded in a longer title", () => {
      expect("Daily note 2026-06-01 draft".match(formatToRegexp("YYYY-MM-DD"))?.[0]).toBe("2026-06-01");
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
