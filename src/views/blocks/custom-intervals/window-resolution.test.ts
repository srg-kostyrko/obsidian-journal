import { beforeAll, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";

import { resolveWindow } from "./window-resolution";

beforeAll(() => {
  installTestCalendar();
});

describe("resolveWindow", () => {
  describe("current-week", () => {
    it("returns the locale-anchored week containing refDate", () => {
      // 2026-05-29 is a Friday; with firstDayOfWeek=Monday the week is 05-25..05-31.
      const r = resolveWindow("current-week", "2026-05-29" as AnchorString);
      expect(r).toEqual({ start: "2026-05-25", end: "2026-05-31" });
    });
  });

  describe("current-month", () => {
    it("returns the calendar month containing refDate", () => {
      const r = resolveWindow("current-month", "2026-05-15" as AnchorString);
      expect(r).toEqual({ start: "2026-05-01", end: "2026-05-31" });
    });
  });

  describe("current-quarter", () => {
    it("returns the calendar quarter containing refDate", () => {
      const r = resolveWindow("current-quarter", "2026-05-15" as AnchorString);
      expect(r).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    });
  });

  describe("current-year", () => {
    it("returns the calendar year containing refDate", () => {
      const r = resolveWindow("current-year", "2026-05-15" as AnchorString);
      expect(r).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    });
  });
});
