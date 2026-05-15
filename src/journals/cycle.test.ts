import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { expectOk } from "@/infrastructure/result/testing";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { customJournal, fakeSettings, fixedJournal } from "./testing";

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

    describe("custom monthly", () => {
      it("lands on the configured anchor for dates inside the first step", () => {
        const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-01-20")));
        expect(result.isSome() && result.value).toBe("2024-01-15");
      });

      it("steps forward to the next anchor for a date past the first interval end", () => {
        const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-02-20")));
        expect(result.isSome() && result.value).toBe("2024-02-15");
      });

      it("clips month-end when anchor is the 30th and target month is February", () => {
        const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-30") });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-02-28")));
        expect(result.isSome() && result.value).toBe("2024-02-29");
      });
    });
  });

  describe("nextAnchor", () => {
    it("advances to the following week anchor for fixed weekly", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      const next = cycle.nextAnchor("w", "2024-03-04" as AnchorString);
      const result = next.isSome() && next.value;
      // With the test calendar (dow=1, doy=4), the anchor of a week is Thursday.
      // next() of the week containing 2024-03-04 (Mon): next week = Mon 2024-03-11,
      // anchor = 2024-03-11 + (4-1) = 2024-03-14.
      expect(result).toBe("2024-03-14");
    });

    it("returns next anchor for custom monthly", () => {
      const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
      const cycle = c.resolve(CycleService);
      const next = cycle.nextAnchor("s", "2024-01-15" as AnchorString);
      expect(next.isSome() && next.value).toBe("2024-02-15");
    });

    it("returns None for an unknown journal", () => {
      const c = buildContainer({});
      const cycle = c.resolve(CycleService);
      expect(cycle.nextAnchor("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });
  });

  describe("previousAnchor", () => {
    it("retreats to the prior week anchor for fixed weekly", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      const previous = cycle.previousAnchor("w", "2024-03-07" as AnchorString);
      // With the test calendar (dow=1, doy=4), 2024-03-07 is Thursday — a valid week anchor.
      // previous() of that week (Mon 2024-03-04 – Sun 2024-03-10): prior week = Mon 2024-02-26,
      // anchor = 2024-02-26 + (4-1) = 2024-02-29.
      expect(previous.isSome() && previous.value).toBe("2024-02-29");
    });

    it("returns previous anchor for custom monthly", () => {
      const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
      const cycle = c.resolve(CycleService);
      const previous = cycle.previousAnchor("s", "2024-02-15" as AnchorString);
      expect(previous.isSome() && previous.value).toBe("2024-01-15");
    });
  });
});
