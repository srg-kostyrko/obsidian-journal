import { moment } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, CUSTOM_LOCALE, localMoment } from "./calendar";

function customWeek(): { dow: number; doy: number } {
  const data = moment.localeData(CUSTOM_LOCALE);
  return { dow: data.firstDayOfWeek(), doy: data.firstDayOfYear() };
}

function globalWeek(): { dow: number; doy: number } {
  const data = moment.localeData();
  return { dow: data.firstDayOfWeek(), doy: data.firstDayOfYear() };
}

describe("Calendar", () => {
  let priorGlobal: { dow: number; doy: number };
  let priorLocale: string;

  beforeEach(() => {
    priorLocale = moment.locale();
    priorGlobal = globalWeek();
  });

  afterEach(() => {
    // restore the global locale's week so tests don't leak state
    moment.updateLocale(priorLocale, { week: priorGlobal });
    moment.locale(priorLocale);
  });

  describe("applyWeekConfig", () => {
    it("sets the custom locale week when given an explicit config", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: false });
      expect(customWeek()).toEqual({ dow: 0, doy: 6 });
    });

    it("leaves the global locale week alone when propagateToGlobal=false", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: false });
      expect(globalWeek()).toEqual(priorGlobal);
    });

    it("updates the global locale week when propagateToGlobal=true", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: true });
      expect(globalWeek()).toEqual({ dow: 0, doy: 6 });
    });

    it('restores the captured initial week onto the custom locale when given "locale"', () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: false });
      calendar.applyWeekConfig("locale", { propagateToGlobal: false });
      expect(customWeek()).toEqual(priorGlobal);
    });

    it("restores the captured initial week onto the global locale after a propagateToGlobal=true push", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: true });
      calendar.applyWeekConfig("locale", { propagateToGlobal: false });
      expect(globalWeek()).toEqual(priorGlobal);
    });

    it("restores the global locale to the captured initial when toggling propagateToGlobal from true to false", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: true });
      calendar.applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: false });
      expect(globalWeek()).toEqual(priorGlobal);
    });

    it("still sets the custom locale to the new week when toggling propagateToGlobal from true to false", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: true });
      calendar.applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: false });
      expect(customWeek()).toEqual({ dow: 1, doy: 4 });
    });
  });

  // A propagated week rewrites the global locale, and moment's locale registry outlives a plugin
  // reload. An instance built afterwards must still know what the locale's own week was.
  describe("locale default after a propagated week", () => {
    it("reports the true locale default from an instance built after the propagation", () => {
      const first = new Calendar();
      first.applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: true });

      const second = new Calendar();

      expect(second.localeWeek()).toEqual(priorGlobal);
    });

    it("restores the true locale default onto the global locale from that later instance", () => {
      const first = new Calendar();
      first.applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: true });

      const second = new Calendar();
      second.applyWeekConfig("locale", { propagateToGlobal: false });

      expect(globalWeek()).toEqual(priorGlobal);
    });

    it("restores the true locale default onto the custom locale from that later instance", () => {
      const first = new Calendar();
      first.applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: true });

      const second = new Calendar();
      second.applyWeekConfig("locale", { propagateToGlobal: false });

      expect(customWeek()).toEqual(priorGlobal);
    });
  });

  describe("localMoment", () => {
    it("resolves a week-based format against the custom locale rather than the global one", () => {
      const calendar = new Calendar();
      calendar.applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: false });
      // Force the global locale to a different week than the plugin's, so this fails if parsing
      // ever consults the global one again. ISO week 1 of 2026 starts Mon 2025-12-29; under a
      // Sunday-start week it would start 2025-12-28.
      moment.updateLocale(priorLocale, { week: { dow: 0, doy: 6 } });

      expect(localMoment("2026-W1", "YYYY-[W]w", true).format("YYYY-MM-DD")).toBe("2025-12-29");
    });
  });

  describe("weekdays", () => {
    it("returns the 7-element localized weekday array from the custom locale, indexed Sunday-first", () => {
      const calendar = new Calendar();
      const weekdays = calendar.weekdays();
      expect(weekdays).toHaveLength(7);
      // Moment's weekdays() is Sunday=0..Saturday=6 regardless of the locale's dow.
      expect(weekdays.every((w) => typeof w === "string" && w.length > 0)).toBe(true);
    });
  });

  describe("weekdaysShort", () => {
    it("carries each weekday's true Sunday-first index alongside its short label", () => {
      const calendar = new Calendar();
      const ordered = calendar.weekdaysShort();
      expect(ordered).toHaveLength(7);
      expect(ordered.map((w) => w.index).toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(ordered.every((w) => typeof w.label === "string" && w.label.length > 0)).toBe(true);
    });

    it("orders the weekdays starting from the locale's first day of week", () => {
      const calendar = new Calendar();
      const indices = calendar.weekdaysShort().map((w) => w.index);
      const first = indices[0];
      expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6].map((offset) => (first + offset) % 7));
    });
  });

  describe("months", () => {
    it("returns the 12 localized month names", () => {
      const calendar = new Calendar();
      const months = calendar.months();
      expect(months).toHaveLength(12);
      expect(months.every((name) => typeof name === "string" && name.length > 0)).toBe(true);
    });
  });
});
