import { moment } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, CUSTOM_LOCALE } from "./calendar";

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
});
