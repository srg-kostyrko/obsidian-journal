// cspell: ignore sexta feira
import { moment } from "obsidian";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { installTestCalendar } from "./testing";

import type { Calendar } from "./calendar";

// Obsidian's own language (moment's global locale) differs from the language a caller asks for.
describe("Calendar.weekdaysIn", () => {
  let prior: string;
  let calendar: Calendar;

  beforeAll(async () => {
    // Importing a locale also makes it moment's global one.
    prior = moment.locale();
    // @ts-expect-error -- moment ships no type declarations for its locale subpath modules.
    await import("moment/locale/pt-br");
    // @ts-expect-error -- as above.
    await import("moment/locale/zh-cn");
    // @ts-expect-error -- as above.
    await import("moment/locale/pl");
    moment.locale("pl");
    calendar = installTestCalendar().calendar;
  });

  afterAll(() => {
    moment.locale(prior);
  });

  it("names weekdays in the requested language, not Obsidian's", () => {
    expect(calendar.weekdaysIn("en")[5]).toBe("Friday");
  });

  it("reads the plugin's Brazilian Portuguese and Simplified Chinese from moment's matching locales", () => {
    expect(calendar.weekdaysIn("pt")[5]).toBe("sexta-feira");
    expect(calendar.weekdaysIn("zh")[5]).toBe("星期五");
  });

  it("falls back to English for a language moment does not know", () => {
    expect(calendar.weekdaysIn("xx")[5]).toBe("Friday");
  });

  it("leaves Obsidian's own locale in place", () => {
    calendar.weekdaysIn("pt");
    expect(moment.locale()).toBe("pl");
  });
});
