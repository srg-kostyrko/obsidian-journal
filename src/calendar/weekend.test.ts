import { describe, expect, it } from "vitest";

import { localeWeekend, resolveWeekend, weekendDayNames, weekendRuns } from "./weekend";

describe("localeWeekend", () => {
  it("reads Saturday and Sunday for en-US", () => {
    expect(localeWeekend("en-US")).toEqual([0, 6]);
  });

  it("reads Friday and Saturday for ar-EG", () => {
    expect(localeWeekend("ar-EG")).toEqual([5, 6]);
  });

  it("falls back to Saturday and Sunday when the runtime has no week info", () => {
    const prototype = Intl.Locale.prototype as object;
    const saved = Object.getOwnPropertyDescriptors(prototype) as Record<string, PropertyDescriptor | undefined>;
    Object.defineProperties(prototype, {
      getWeekInfo: { value: undefined, configurable: true },
      weekInfo: { value: undefined, configurable: true },
    });
    try {
      expect(localeWeekend("ar-EG")).toEqual([0, 6]);
    } finally {
      Object.defineProperties(prototype, { getWeekInfo: saved.getWeekInfo ?? {} });
      if (saved.weekInfo) Object.defineProperty(prototype, "weekInfo", saved.weekInfo);
      else Reflect.deleteProperty(prototype, "weekInfo");
    }
  });

  it("falls back to Saturday and Sunday for a locale id Intl rejects", () => {
    expect(localeWeekend("x-custom-junk")).toEqual([0, 6]);
  });
});

describe("resolveWeekend", () => {
  it("follows the locale", () => {
    expect([...resolveWeekend({ type: "locale" }, "ar-EG")].toSorted()).toEqual([5, 6]);
  });

  it("uses the custom days, and an empty list is no weekend", () => {
    expect([...resolveWeekend({ type: "custom", days: [4, 5] }, "en-US")].toSorted()).toEqual([4, 5]);
    expect(resolveWeekend({ type: "custom", days: [] }, "en-US").size).toBe(0);
  });
});

describe("weekendRuns", () => {
  const sat_sun = new Set([6, 0]);

  it("makes one band of a Monday-start weekend", () => {
    expect(weekendRuns([1, 2, 3, 4, 5, 6, 0], sat_sun)).toEqual([{ start: 5, span: 2 }]);
  });

  it("splits a Sunday-start weekend into the first and last columns", () => {
    expect(weekendRuns([0, 1, 2, 3, 4, 5, 6], sat_sun)).toEqual([
      { start: 0, span: 1 },
      { start: 6, span: 1 },
    ]);
  });

  it("joins the columns either side of a hidden day", () => {
    expect(weekendRuns([1, 2, 3, 4, 5, 0], new Set([5, 6, 0]))).toEqual([{ start: 4, span: 2 }]);
  });

  it("gives no run for an empty weekend", () => {
    expect(weekendRuns([1, 2, 3, 4, 5, 6, 0], new Set())).toEqual([]);
  });
});

describe("weekendDayNames", () => {
  const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  it("lists the days Monday first, so Sunday comes last", () => {
    expect(weekendDayNames(new Set([0, 6]), NAMES)).toEqual(["Saturday", "Sunday"]);
    expect(weekendDayNames(new Set([5, 6]), NAMES)).toEqual(["Friday", "Saturday"]);
  });

  it("lists nothing for no weekend", () => {
    expect(weekendDayNames(new Set(), NAMES)).toEqual([]);
  });
});
