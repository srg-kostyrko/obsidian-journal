import { moment } from "obsidian";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";

import { checkWeekday } from "./engine-checks";
import { buildCondition } from "./testing";

describe("checkWeekday under a native-digit locale", () => {
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

  it("matches a Friday", () => {
    const friday = DayPeriod.containing(date("2026-11-06"));
    expect(checkWeekday(buildCondition("weekday", { weekdays: [5] }), friday)).toBe(true);
    expect(checkWeekday(buildCondition("weekday", { weekdays: [4] }), friday)).toBe(false);
  });
});
