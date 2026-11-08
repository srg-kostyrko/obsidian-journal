import { moment } from "obsidian";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { date, installTestCalendar } from "./testing";

// Arabic formats every digit natively, so `format("d")` reads back as a string `Number` cannot parse.
describe("CalendarDate.weekday under a native-digit locale", () => {
  let prior: string;

  beforeAll(async () => {
    // @ts-expect-error -- moment ships no type declarations for its locale subpath modules.
    await import("moment/locale/ar");
    prior = moment.locale();
    moment.locale("ar");
    installTestCalendar();
  });

  afterAll(() => {
    moment.locale(prior);
  });

  it("formats the weekday in native digits, which is why weekday() exists", () => {
    expect(Number(date("2026-11-07").format("d"))).toBeNaN();
  });

  it("returns the weekday as a number, 0 = Sunday", () => {
    expect(date("2026-11-07").weekday()).toBe(6);
    expect(date("2026-11-08").weekday()).toBe(0);
    expect(date("2026-11-06").weekday()).toBe(5);
  });
});
