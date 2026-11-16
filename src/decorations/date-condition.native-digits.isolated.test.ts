import { moment } from "obsidian";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { date, installTestCalendar } from "@/calendar/testing";

import { matchesDate } from "./date-condition";

// Arabic formats every digit natively, so a day read back through `format("D")` is NaN.
describe("matchesDate under a native-digit locale", () => {
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

  it("matches a specific day, month and year under a native-digit locale", () => {
    expect(matchesDate({ type: "date", day: 14, month: 10, year: 2026 }, date("2026-11-14"))).toBe(true);
  });

  it("rejects a different day under a native-digit locale", () => {
    expect(matchesDate({ type: "date", day: 14, month: 10, year: 2026 }, date("2026-11-15"))).toBe(false);
  });
});
