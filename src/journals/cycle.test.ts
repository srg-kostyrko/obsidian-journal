import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { expectOk } from "@/infrastructure/result/testing";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { customJournal, fakeSettings, fixedJournal, unwrap } from "./testing";

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

      it("preserves distance-from-month-end when anchor is the 30th and target month is February", () => {
        // v2 fidelity: anchor 2024-01-30 is 1 day before Jan-31 (end of month). Advancing 1 month
        // produces 2024-02-28, which is 1 day before Feb-29 (end of leap-year Feb). Date 2024-02-28
        // falls inside the interval [2024-02-28, 2024-03-27].
        const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-30") });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-02-28")));
        expect(result.isSome() && result.value).toBe("2024-02-28");
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

  describe("startOf and endOf", () => {
    it("returns the anchor's period start/end for fixed weekly", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      const anchor = unwrap(cycle.anchorOf("w", unwrapResult(CalendarDate.parse("2024-03-06"))));
      // Adjust expected start/end to match the test calendar's dow=1 doy=4 — week containing
      // 2024-03-06 (Wednesday) starts Mon 2024-03-04 and ends Sun 2024-03-10.
      const start = cycle.startOf("w", anchor);
      const end = cycle.endOf("w", anchor);
      expect(start.isSome() && start.value.toAnchor()).toBe("2024-03-04");
      expect(end.isSome() && end.value.toAnchor()).toBe("2024-03-10");
    });

    it("returns the anchor and computed end for custom monthly", () => {
      const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
      const cycle = c.resolve(CycleService);
      const start = cycle.startOf("s", "2024-01-15" as AnchorString);
      const end = cycle.endOf("s", "2024-01-15" as AnchorString);
      expect(start.isSome() && start.value.toAnchor()).toBe("2024-01-15");
      expect(end.isSome() && end.value.toAnchor()).toBe("2024-02-14"); // Feb 15 - 1 day
    });

    it("returns the stored endDate for custom anchor with extension", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/1.md" as VaultPath,
        endDate: "2024-01-14" as AnchorString,
      });
      const cycle = c.resolve(CycleService);
      const end = cycle.endOf("s", "2024-01-01" as AnchorString);
      expect(end.isSome() && end.value.toAnchor()).toBe("2024-01-14");
    });

    it("returns None for unknown journal", () => {
      const c = buildContainer({});
      const cycle = c.resolve(CycleService);
      expect(cycle.startOf("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
      expect(cycle.endOf("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });
  });

  describe("custom variant extension awareness", () => {
    it("nextAnchor after an extended interval starts at endDate + 1 day", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/1.md" as VaultPath,
        endDate: "2024-01-14" as AnchorString, // extended through Jan 14 instead of Jan 7
      });
      const cycle = c.resolve(CycleService);
      const next = cycle.nextAnchor("s", "2024-01-01" as AnchorString);
      expect(next.isSome() && next.value).toBe("2024-01-15");
    });
  });

  describe("offsets", () => {
    it("returns +day-from-start, -day-to-end for a date inside a weekly anchor", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      // 2024-03-06 (Wed) of the Mon 2024-03-04 — Sun 2024-03-10 week.
      // From start Mon: day 3 (Mon=1, Tue=2, Wed=3). To end Sun: -5 (Wed is 4 days before Sun,
      // negated and decremented by 1 to match v2 calculateOffset semantics).
      const off = cycle.offsets("w", unwrapResult(CalendarDate.parse("2024-03-06")));
      expect(off.isSome() && off.value).toEqual([3, -5]);
    });

    it("returns None for unknown journal", () => {
      const c = buildContainer({});
      const cycle = c.resolve(CycleService);
      expect(cycle.offsets("missing", unwrapResult(CalendarDate.parse("2024-01-01"))).isNone()).toBe(true);
    });
  });

  describe("countRepeats", () => {
    it("counts intervals between two anchors for fixed weekly", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      // 2024-01-01 (Mon) and 2024-01-22 (Mon) are 3 weeks apart.
      const result = cycle.countRepeats("w", "2024-01-01" as AnchorString, "2024-01-22" as AnchorString);
      expect(result.isSome() && result.value).toBe(3);
    });

    it("returns equal magnitude regardless of direction", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      const forward = unwrap(cycle.countRepeats("w", "2024-01-01" as AnchorString, "2024-01-22" as AnchorString));
      const backward = unwrap(cycle.countRepeats("w", "2024-01-22" as AnchorString, "2024-01-01" as AnchorString));
      expect(Math.abs(forward)).toBe(Math.abs(backward));
    });
  });
});
