import { moment } from "obsidian";
import { describe, expect, it } from "vitest";

import { CUSTOM_LOCALE } from "./calendar";
import { installTestCalendar, testCalendar } from "./testing";

describe("ambient test calendar", () => {
  it("starts every test on the Monday/ISO grid without an explicit install", () => {
    expect(moment.localeData(CUSTOM_LOCALE).firstDayOfWeek()).toBe(1);
  });

  it("lets a test replace the ambient grid", () => {
    installTestCalendar({ dow: 0, doy: 6 });

    expect(moment.localeData(CUSTOM_LOCALE).firstDayOfWeek()).toBe(0);
  });

  it("restores the ambient grid for the next test", () => {
    expect(moment.localeData(CUSTOM_LOCALE).firstDayOfWeek()).toBe(1);
  });

  it("returns the same calendar instance a replacement installed", () => {
    const { calendar } = installTestCalendar({ dow: 0, doy: 6 });

    expect(testCalendar()).toBe(calendar);
  });
});
