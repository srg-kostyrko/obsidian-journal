import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";

import { formatToRegexp } from "./format-regex";

describe("formatToRegexp", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("Y / M / D tokens", () => {
    it("compiles YYYY-MM-DD into a regex matching that shape", () => {
      const regex = formatToRegexp("YYYY-MM-DD");
      expect(regex.test("2025-03-14")).toBe(true);
      expect(regex.test("25-3-1")).toBe(false);
    });

    it("compiles YYYY into a 4-digit year matcher", () => {
      const regex = formatToRegexp("YYYY");
      expect(regex.test("2025")).toBe(true);
      expect(regex.test("25")).toBe(false);
    });
  });

  describe("week tokens", () => {
    it("compiles YYYY-[W]w into a regex matching ISO week notation", () => {
      const regex = formatToRegexp("YYYY-[W]w");
      expect(regex.test("2025-W3")).toBe(true);
      expect(regex.test("2025-W42")).toBe(true);
    });
  });

  describe("literal escape brackets", () => {
    it("treats text inside square brackets as literal", () => {
      const regex = formatToRegexp("[journal-]YYYY");
      expect(regex.test("journal-2025")).toBe(true);
    });
  });
});
