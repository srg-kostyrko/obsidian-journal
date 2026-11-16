import { moment } from "obsidian";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";

import { describeCondition } from "./describe-condition";

// Obsidian set to a language the plugin does not translate: moment speaks Polish while the
// summary sentence falls back to English, so a weekday taken from moment would mix the two.
describe("describeCondition with moment in an untranslated language", () => {
  let prior: string;

  beforeAll(async () => {
    // @ts-expect-error -- moment ships no type declarations for its locale subpath modules.
    await import("moment/locale/pl");
    prior = moment.locale();
    moment.locale("pl");
    installTestCalendar();
  });

  afterAll(() => {
    moment.locale(prior);
  });

  it("names the weekday of month in the summary's language", () => {
    const out = describeCondition({ type: "date", day: { nth: "last", weekday: 5 }, month: -1, year: null });

    expect(out).toContain(m.common_weekday_name({ index: "5" }));
    expect(out).not.toContain(moment.localeData().weekdays()[5]);
  });

  it("names the weekdays of a weekday condition in the summary's language", () => {
    const out = describeCondition({ type: "weekday", weekdays: [1, 5] });

    expect(out).toContain(m.common_weekday_name({ index: "1" }));
    expect(out).not.toContain(moment.localeData().weekdays()[5]);
  });
});
