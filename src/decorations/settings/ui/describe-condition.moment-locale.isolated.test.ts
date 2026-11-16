// cspell: ignore sexta feira
import { moment } from "obsidian";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Calendar } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { initLocale } from "@/i18n";

import { describeCondition } from "./describe-condition";

// Obsidian set to a language the plugin does not translate: moment speaks Polish while the
// summary sentence falls back to English, so a weekday taken from moment would mix the two.
describe("describeCondition with moment in an untranslated language", () => {
  let prior: string;
  let calendar: Calendar;

  beforeAll(async () => {
    // Importing a locale also makes it moment's global one.
    prior = moment.locale();
    // @ts-expect-error -- moment ships no type declarations for its locale subpath modules.
    await import("moment/locale/pl");
    // @ts-expect-error -- as above.
    await import("moment/locale/pt-br");
    moment.locale("pl");
    calendar = installTestCalendar().calendar;
  });

  afterAll(() => {
    moment.locale(prior);
    initLocale("en");
  });

  it("names the weekday of month in the summary's language", () => {
    const out = describeCondition({ type: "date", day: { nth: "last", weekday: 5 }, month: -1, year: null }, calendar);

    expect(out).toContain("Friday");
    expect(out).not.toContain(moment.localeData().weekdays()[5]);
  });

  it("names the weekdays of a weekday condition in the summary's language", () => {
    const out = describeCondition({ type: "weekday", weekdays: [1, 5] }, calendar);

    expect(out).toContain("Monday");
    expect(out).not.toContain(moment.localeData().weekdays()[5]);
  });

  it("follows the plugin's language when it is translated", () => {
    initLocale("pt");
    const out = describeCondition({ type: "weekday", weekdays: [5] }, calendar);
    initLocale("en");

    expect(out).toContain("sexta-feira");
  });
});
