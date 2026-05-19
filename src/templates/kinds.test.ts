import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { parseDate, parseNumber, parseString, patternForKind, renderDate, renderNumber, renderString } from "./kinds";

import type { Modifier, VariableSpec } from "./types";

describe("kinds", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("renderString", () => {
    it("emits the value verbatim", () => {
      expect(renderString({ kind: "string", value: "hello" })).toBe("hello");
    });
  });

  describe("renderNumber", () => {
    it("formats with toString", () => {
      expect(renderNumber({ kind: "number", value: 42 })).toBe("42");
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
    it("returns non-greedy any-match for string", () => {
      expect(patternForKind({ kind: "string", value: "" })).toBe(".+?");
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
});
