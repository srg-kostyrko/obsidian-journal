import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, Clock } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import {
  parseDate,
  parseNumber,
  parseString,
  patternForKind,
  renderClock,
  renderDate,
  renderNumber,
  renderString,
} from "./kinds";

import type { Modifier, VariableSpec } from "./types";

describe("kinds", () => {
  describe("renderString", () => {
    it("emits the value verbatim", () => {
      expect(renderString({ kind: "string", value: "hello" })).toBe("hello");
    });
  });

  describe("renderNumber", () => {
    it("formats with toString", () => {
      expect(renderNumber({ kind: "number", value: 42 })).toBe("42");
    });

    it("applies an offset before rendering", () => {
      const mods: Modifier[] = [{ kind: "offset", sign: 1, amount: 3 }];
      expect(renderNumber({ kind: "number", value: 4 }, mods)).toBe("7");
    });

    it("renders an ordinal for the o format", () => {
      expect(renderNumber({ kind: "number", value: 4 }, [], "o")).toBe("4th");
    });

    it("renders an ordinal past two digits", () => {
      expect(renderNumber({ kind: "number", value: 102 }, [], "o")).toBe("102nd");
    });

    it("applies the offset before the ordinal", () => {
      const mods: Modifier[] = [{ kind: "offset", sign: 1, amount: 3 }];
      expect(renderNumber({ kind: "number", value: 4 }, mods, "o")).toBe("7th");
    });

    it("renders zero as an ordinal", () => {
      expect(renderNumber({ kind: "number", value: 0 }, [], "o")).toBe("0th");
    });
  });

  describe("renderDate", () => {
    it("uses defaultFormat when no override given", () => {
      const spec: VariableSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      expect(renderDate(spec, [])).toBe("2022-01-01");
    });

    it("respects format override", () => {
      const spec: VariableSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      expect(renderDate(spec, [], "MMM D, YYYY")).toBe("Jan 1, 2022");
    });

    it("applies modifiers before formatting", () => {
      const spec: VariableSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      const modifiers: Modifier[] = [{ kind: "shift", sign: 1, amount: 1, unit: "w" }];
      expect(renderDate(spec, modifiers)).toBe("2022-01-08");
    });
  });

  describe("patternForKind", () => {
    it("returns the bound value as an escaped literal for string", () => {
      expect(patternForKind({ kind: "string", value: "My Journal." })).toBe(String.raw`My Journal\.`);
    });

    it("returns signed-integer pattern for number", () => {
      expect(patternForKind({ kind: "number", value: 0 })).toBe(String.raw`-?\d+`);
    });

    it("returns format-derived pattern for date", () => {
      const spec: VariableSpec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2022-01-01")),
        defaultFormat: "YYYY-MM-DD",
      };
      const pattern = patternForKind(spec);
      expect(new RegExp(`^${pattern}$`).test("2022-01-01")).toBe(true);
    });

    it("matches a plain integer for a number with no format", () => {
      const pattern = new RegExp(`^${patternForKind({ kind: "number", value: 0 })}$`);
      expect(pattern.test("42")).toBe(true);
      expect(pattern.test("42nd")).toBe(false);
    });

    it("matches an ordinal for the o format", () => {
      const pattern = new RegExp(`^${patternForKind({ kind: "number", value: 0 }, "o")}$`);
      expect(pattern.test("3rd")).toBe(true);
    });

    // The suffix is optional so a locale whose ordinal() degrades to a bare number (e.g. az/kk/ky/tg
    // on negatives, cy/ka on zero) still round-trips; the accepted cost is also matching a plain number.
    it("also matches a bare number for the o format", () => {
      const pattern = new RegExp(`^${patternForKind({ kind: "number", value: 0 }, "o")}$`);
      expect(pattern.test("3")).toBe(true);
    });

    it("matches an ordinal past two digits", () => {
      const pattern = new RegExp(`^${patternForKind({ kind: "number", value: 0 }, "o")}$`);
      expect(pattern.test("100th")).toBe(true);
    });
  });

  describe("renderClock", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders Clock with default format when no override", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      const spec = { kind: "clock" as const, value: Clock.now(), defaultFormat: "HH:mm" };
      expect(renderClock(spec, [])).toBe("10:37");
    });

    it("renders Clock with format override", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      const spec = { kind: "clock" as const, value: Clock.now(), defaultFormat: "HH:mm" };
      expect(renderClock(spec, [], "HH:mm:ss")).toBe("10:37:42");
    });

    it("applies modifiers before rendering", () => {
      vi.setSystemTime(new Date("2026-05-20T10:37:42"));
      const spec = { kind: "clock" as const, value: Clock.now(), defaultFormat: "HH:mm" };
      const result = renderClock(spec, [{ kind: "shift", sign: -1, amount: 1, unit: "h" }]);
      expect(result).toBe("09:37");
    });
  });

  describe("parseString / parseNumber / parseDate", () => {
    it("parses a string capture", () => {
      expect(parseString("hello", "x")).toEqual({ kind: "ok", value: "hello" });
    });

    it("parses a valid number", () => {
      const result = parseNumber("42", "n");
      expectOk(result);
      expect(result.value).toBe(42);
    });

    it("returns Err for invalid number", () => {
      const result = parseNumber("foo", "n");
      expectErr(result);
      expect(result.error.detail.kind).toBe("invalid-number");
    });

    it("parses a date capture", () => {
      const result = parseDate("2022-01-05", "YYYY-MM-DD", [], "d");
      expectOk(result);
      expect(result.value.toAnchor()).toBe("2022-01-05");
    });

    it("un-applies modifiers on the parsed date", () => {
      const result = parseDate("2022-01-08", "YYYY-MM-DD", [{ kind: "shift", sign: 1, amount: 1, unit: "w" }], "d");
      expectOk(result);
      expect(result.value.toAnchor()).toBe("2022-01-01");
    });

    it("returns Err for date capture moment cannot parse strictly", () => {
      const result = parseDate("not-a-date", "YYYY-MM-DD", [], "d");
      expectErr(result);
      expect(result.error.detail.kind).toBe("invalid-date");
    });
  });

  describe("patternForKind with alternatives", () => {
    it("admits a literal alongside a date's format pattern", () => {
      const spec = {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2026-08-28")),
        defaultFormat: "YYYY-MM-DD",
        alternatives: ["(unanswered)"],
      } as const;
      const pattern = new RegExp(`^${patternForKind(spec)}$`);
      expect(pattern.test("2026-08-28")).toBe(true);
      expect(pattern.test("(unanswered)")).toBe(true);
      expect(pattern.test("anything else")).toBe(false);
    });

    // cSpell:ignore Xunanswered
    it("escapes regex metacharacters in an alternative", () => {
      const spec = { kind: "number", value: 1, alternatives: ["(unanswered)"] } as const;
      const pattern = new RegExp(`^${patternForKind(spec)}$`);
      expect(pattern.test("(unanswered)")).toBe(true);
      expect(pattern.test("Xunanswered)")).toBe(false);
    });

    it("offers only the alternatives when a bound string has them", () => {
      const spec = { kind: "string", value: "(unanswered)", alternatives: ["(unanswered)", "happy", "sad"] } as const;
      const pattern = new RegExp(`^${patternForKind(spec)}$`);
      expect(pattern.test("happy")).toBe(true);
      expect(pattern.test("(unanswered)")).toBe(true);
      expect(pattern.test("elated")).toBe(false);
    });

    it("is unchanged when alternatives is absent", () => {
      expect(patternForKind({ kind: "number", value: 1 })).toBe(String.raw`-?\d+`);
    });
  });
});
