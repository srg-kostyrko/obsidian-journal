import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { expectOk } from "@/infrastructure/result/testing";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { fakeSettings, fixedJournal } from "./testing";

function buildContainer(journals: Parameters<typeof fakeSettings>[0]): Container {
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  return c;
}

function unwrapResult<T, E>(r: Parameters<typeof expectOk<T, E>>[0]): T {
  expectOk(r);
  return r.value;
}

describe("CycleService", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });

  afterEach(() => {
    teardown();
  });

  describe("anchorOf", () => {
    describe("fixed daily", () => {
      it("returns the date itself as the anchor", () => {
        const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("daily", unwrapResult(CalendarDate.parse("2022-03-15")));
        expect(result.isSome() && result.value).toBe("2022-03-15");
      });

      it("returns None for an unknown journal", () => {
        const c = buildContainer({});
        const cycle = c.resolve(CycleService);
        expect(cycle.anchorOf("missing", unwrapResult(CalendarDate.parse("2022-03-15"))).isNone()).toBe(true);
      });
    });

    describe("fixed weekly", () => {
      it("returns the year-correct anchor for a week spanning a year boundary", () => {
        const c = buildContainer({ weekly: fixedJournal("weekly", { type: "week" }) });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("weekly", unwrapResult(CalendarDate.parse("2020-12-30")));
        expect(result.isSome() && result.value.startsWith("2020")).toBe(true);
      });
    });
  });
});
