import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { expectOk } from "@/infrastructure/result/testing";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { JournalsRepository } from "./repository";
import { customJournal, fakeRepo, fixedJournal, unwrap } from "./testing";

function buildContainer(journals: Parameters<typeof fakeRepo>[0]): Container {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
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
      it("returns a year-2020 anchor for a date the week-year considers 2020", () => {
        const c = buildContainer({ weekly: fixedJournal("weekly", { type: "week" }) });
        const cycle = c.resolve(CycleService);
        // Week containing Wed 2020-12-30 starts Mon 2020-12-28, ends Sun 2021-01-03.
        // With dow=1, the anchor is the week's first day = Mon 2020-12-28.
        const result = cycle.anchorOf("weekly", unwrapResult(CalendarDate.parse("2020-12-30")));
        expect(result.isSome() && result.value).toBe("2020-12-28");
      });

      it("returns a year-2021 anchor for a date the week-year considers 2021", () => {
        const c = buildContainer({ weekly: fixedJournal("weekly", { type: "week" }) });
        const cycle = c.resolve(CycleService);
        // Week containing Thu 2021-01-07 starts Mon 2021-01-04, ends Sun 2021-01-10.
        // With dow=1, the anchor is the week's first day = Mon 2021-01-04. A mid-week input
        // keeps this distinct from an identity function.
        const result = cycle.anchorOf("weekly", unwrapResult(CalendarDate.parse("2021-01-07")));
        expect(result.isSome() && result.value).toBe("2021-01-04");
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

      it("clamps a day-30 anchor to the last day of a shorter month", () => {
        // Feb 2024 has 29 days, so the 30th clamps to the 29th; 2024-02-28 still belongs to the
        // preceding interval [2024-01-30, 2024-02-28].
        const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-30") });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-02-28")));
        expect(result.isSome() && result.value).toBe("2024-01-30");
      });

      it("keeps a month-end anchor on month ends across a short month", () => {
        // The grid from 2025-01-31 is 01-31, 02-28, 03-31, 04-30, 05-31 — 2025-05-15 falls inside
        // the interval opened on 2025-04-30.
        const c = buildContainer({ s: customJournal("s", "month", 1, "2025-01-31") });
        const cycle = c.resolve(CycleService);
        const result = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2025-05-15")));
        expect(result.isSome() && result.value).toBe("2025-04-30");
      });
    });
  });

  describe("representativeOf", () => {
    it("returns the week's representative day for a weekly journal", () => {
      const c = buildContainer({ weekly: fixedJournal("weekly", { type: "week" }) });

      const result = c.resolve(CycleService).representativeOf("weekly", "2025-03-10" as AnchorString);

      expect(unwrap(result).toAnchor()).toBe("2025-03-13");
    });

    it("returns the anchor itself for a monthly journal", () => {
      const c = buildContainer({ monthly: fixedJournal("monthly", { type: "month" }) });

      const result = c.resolve(CycleService).representativeOf("monthly", "2025-03-01" as AnchorString);

      expect(unwrap(result).toAnchor()).toBe("2025-03-01");
    });

    it("returns the interval start for a custom journal", () => {
      const c = buildContainer({ sprints: customJournal("sprints", "week", 2, "2024-01-01") });

      const result = c.resolve(CycleService).representativeOf("sprints", "2024-01-01" as AnchorString);

      expect(unwrap(result).toAnchor()).toBe("2024-01-01");
    });

    it("returns none for an unknown journal", () => {
      const c = buildContainer({});

      expect(
        c
          .resolve(CycleService)
          .representativeOf("missing", "2025-03-10" as AnchorString)
          .isNone(),
      ).toBe(true);
    });
  });

  describe("nextAnchor", () => {
    it("advances to the following week anchor for fixed weekly", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      const next = cycle.nextAnchor("w", "2024-03-04" as AnchorString);
      const result = next.isSome() && next.value;
      // With the test calendar (dow=1), the anchor of a week is its first day (Monday).
      // next() of the week containing 2024-03-04 (Mon): next week = Mon 2024-03-11.
      expect(result).toBe("2024-03-11");
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

    describe("custom monthly anchored to a month end", () => {
      it("clamps to the last day of a month too short for the configured day", () => {
        const c = buildContainer({ s: customJournal("s", "month", 1, "2025-01-31") });
        const cycle = c.resolve(CycleService);
        const next = cycle.nextAnchor("s", "2025-01-31" as AnchorString);
        expect(next.isSome() && next.value).toBe("2025-02-28");
      });

      it("returns to the month end after passing through a short month", () => {
        const c = buildContainer({ s: customJournal("s", "month", 1, "2025-01-31") });
        const cycle = c.resolve(CycleService);
        const next = cycle.nextAnchor("s", "2025-02-28" as AnchorString);
        expect(next.isSome() && next.value).toBe("2025-03-31");
      });

      it("resumes the configured phase from an anchor left off-grid by an extension", () => {
        const c = buildContainer({ s: customJournal("s", "month", 1, "2025-01-31") });
        const index = c.resolve(JournalsIndex);
        index.register({
          journalName: "s",
          anchor: "2025-02-28" as AnchorString,
          path: "S/feb.md" as VaultPath,
          endDate: "2025-03-04" as AnchorString, // extended past its computed end of 2025-03-30
        });
        const cycle = c.resolve(CycleService);
        const next = cycle.nextAnchor("s", "2025-03-05" as AnchorString);
        expect(next.isSome() && next.value).toBe("2025-04-30");
      });
    });

    describe("custom monthly anchored mid-month", () => {
      it("restores the configured day in the month after a clamped one", () => {
        const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-30") });
        const cycle = c.resolve(CycleService);
        const next = cycle.nextAnchor("s", "2024-02-29" as AnchorString);
        expect(next.isSome() && next.value).toBe("2024-03-30");
      });
    });

    describe("custom quarterly anchored to a month end", () => {
      it("returns to the month end after a quarter landing on a 30-day month", () => {
        const c = buildContainer({ s: customJournal("s", "quarter", 1, "2025-01-31") });
        const cycle = c.resolve(CycleService);
        const next = cycle.nextAnchor("s", "2025-04-30" as AnchorString);
        expect(next.isSome() && next.value).toBe("2025-07-31");
      });
    });

    describe("custom yearly anchored to a leap day", () => {
      it("returns to the leap day in a year that has one", () => {
        const c = buildContainer({ s: customJournal("s", "year", 1, "2024-02-29") });
        const cycle = c.resolve(CycleService);
        const next = cycle.nextAnchor("s", "2027-02-28" as AnchorString);
        expect(next.isSome() && next.value).toBe("2028-02-29");
      });
    });
  });

  describe("previousAnchor", () => {
    it("retreats to the prior week anchor for fixed weekly", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      const previous = cycle.previousAnchor("w", "2024-03-04" as AnchorString);
      // With the test calendar (dow=1), 2024-03-04 is the anchor of the week Mon 2024-03-04 –
      // Sun 2024-03-10; the prior week's anchor is its first day = Mon 2024-02-26.
      expect(previous.isSome() && previous.value).toBe("2024-02-26");
    });

    it("returns previous anchor for custom monthly", () => {
      const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
      const cycle = c.resolve(CycleService);
      const previous = cycle.previousAnchor("s", "2024-02-15" as AnchorString);
      expect(previous.isSome() && previous.value).toBe("2024-01-15");
    });

    it("steps a month-end anchor back onto the previous month's last day", () => {
      const c = buildContainer({ s: customJournal("s", "month", 1, "2025-01-31") });
      const cycle = c.resolve(CycleService);
      const previous = cycle.previousAnchor("s", "2025-03-31" as AnchorString);
      expect(previous.isSome() && previous.value).toBe("2025-02-28");
    });

    it("steps a quarterly month-end anchor back onto the previous quarter's last day", () => {
      const c = buildContainer({ s: customJournal("s", "quarter", 1, "2025-01-31") });
      const cycle = c.resolve(CycleService);
      const previous = cycle.previousAnchor("s", "2025-04-30" as AnchorString);
      expect(previous.isSome() && previous.value).toBe("2025-01-31");
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

    it("anchorOf maps a date inside an extended interval to that interval's anchor", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/1.md" as VaultPath,
        endDate: "2024-01-14" as AnchorString, // extended through Jan 14 instead of Jan 7
      });
      const cycle = c.resolve(CycleService);
      // 2024-01-10 lies in the extended first interval [2024-01-01, 2024-01-14], not a
      // phantom computed week starting 2024-01-08.
      const anchor = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-01-10")));
      expect(anchor.isSome() && anchor.value).toBe("2024-01-01");
    });

    it("anchorOf steps past an extended interval to the next computed anchor", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/1.md" as VaultPath,
        endDate: "2024-01-14" as AnchorString,
      });
      const cycle = c.resolve(CycleService);
      // The interval after the extension starts 2024-01-15; 2024-01-20 falls inside it.
      const anchor = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-01-20")));
      expect(anchor.isSome() && anchor.value).toBe("2024-01-15");
    });

    it("anchorOf maps a date inside an extended interval that precedes the configured anchor", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-15") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2023-12-18" as AnchorString,
        path: "S/prev.md" as VaultPath,
        endDate: "2024-01-14" as AnchorString, // extended right up to the day before the anchor
      });
      const cycle = c.resolve(CycleService);
      // 2024-01-05 lies in the stored interval [2023-12-18, 2024-01-14], reached by walking
      // backward from the configured anchor 2024-01-15.
      const anchor = cycle.anchorOf("s", unwrapResult(CalendarDate.parse("2024-01-05")));
      expect(anchor.isSome() && anchor.value).toBe("2023-12-18");
    });
  });

  describe("offsets", () => {
    it("returns +day-from-start, -day-to-end for a date inside a weekly anchor", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      // 2024-03-06 (Wed) of the Mon 2024-03-04 — Sun 2024-03-10 week.
      // From start Mon: day 3 (Mon=1, Tue=2, Wed=3). To end Sun: -5 (Wed is 4 days before Sun,
      // negated and decremented by 1 so offsets are 1-based from both ends, never 0).
      const off = cycle.offsets("w", unwrapResult(CalendarDate.parse("2024-03-06")));
      expect(off.isSome() && off.value).toEqual([3, -5]);
    });

    it("returns None for unknown journal", () => {
      const c = buildContainer({});
      const cycle = c.resolve(CycleService);
      expect(cycle.offsets("missing", unwrapResult(CalendarDate.parse("2024-01-01"))).isNone()).toBe(true);
    });
  });

  describe("intervalsInRange", () => {
    it("projects every scheduled interval overlapping the range when no notes exist", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const cycle = c.resolve(CycleService);
      const result = cycle.intervalsInRange("s", "2024-01-05" as AnchorString, "2024-01-20" as AnchorString);
      expect([...result]).toEqual(["2024-01-01", "2024-01-08", "2024-01-15"]);
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

    it("returns None when the from anchor does not parse", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      expect(cycle.countRepeats("w", "" as AnchorString, "2024-01-22" as AnchorString).isNone()).toBe(true);
    });

    it("returns None when the to anchor does not parse", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      expect(cycle.countRepeats("w", "2024-01-01" as AnchorString, "nonsense" as AnchorString).isNone()).toBe(true);
    });

    it("counts whole weeks from a mid-week start date", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      // Wed 2024-01-03 sits in the week anchored Mon 2024-01-01; the week anchored
      // 2024-01-15 is two weeks on, however far into its week the start date falls.
      const result = cycle.countRepeats("w", "2024-01-03" as AnchorString, "2024-01-15" as AnchorString);
      expect(result.isSome() && result.value).toBe(2);
    });

    it("counts whole months from a mid-month start date", () => {
      const c = buildContainer({ m: fixedJournal("m", { type: "month" }) });
      const cycle = c.resolve(CycleService);
      const result = cycle.countRepeats("m", "2024-06-15" as AnchorString, "2024-08-01" as AnchorString);
      expect(result.isSome() && result.value).toBe(2);
    });

    it("returns equal magnitude regardless of direction", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const cycle = c.resolve(CycleService);
      const forward = unwrap(cycle.countRepeats("w", "2024-01-01" as AnchorString, "2024-01-22" as AnchorString));
      const backward = unwrap(cycle.countRepeats("w", "2024-01-22" as AnchorString, "2024-01-01" as AnchorString));
      expect(Math.abs(forward)).toBe(Math.abs(backward));
    });

    it("counts whole intervals from an off-anchor start for a custom cycle", () => {
      // Cycle anchored 2026-06-01, stepping every 7 days: 06-01, 06-08, 06-15, 06-22, ...
      // A `from` of 2026-06-03 sits mid-interval; it must snap to 2026-06-01 before counting,
      // so the walk to 2026-06-22 crosses exactly 3 interval boundaries, not 2.
      const c = buildContainer({ s: customJournal("s", "day", 7, "2026-06-01") });
      const cycle = c.resolve(CycleService);
      const result = cycle.countRepeats("s", "2026-06-03" as AnchorString, "2026-06-22" as AnchorString);
      expect(result.isSome() && result.value).toBe(3);
    });

    describe("custom interval extended past its default end", () => {
      it("counts the same number of intervals as stepping through nextAnchor", () => {
        // The first interval is extended a full week past its default end of 01-07, so the
        // index-aware grid is 01-01, 01-15, 01-22, 01-29, 02-05 — 4 steps, not the 5 a raw
        // 7-day stepping (ignoring the extension) would produce.
        const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
        const index = c.resolve(JournalsIndex);
        index.register({
          journalName: "s",
          anchor: "2024-01-01" as AnchorString,
          path: "S/1.md" as VaultPath,
          endDate: "2024-01-14" as AnchorString,
        });
        const cycle = c.resolve(CycleService);
        const to = "2024-02-05" as AnchorString;
        let current = "2024-01-01" as AnchorString;
        let steps = 0;
        // Capped so a stalled nextAnchor fails the test below rather than hanging the run.
        const maxSteps = 8;
        while (current < to && steps < maxSteps) {
          current = unwrap(cycle.nextAnchor("s", current));
          steps++;
        }
        expect(current).toBe(to);
        expect(steps).toBe(4);
        const result = cycle.countRepeats("s", "2024-01-01" as AnchorString, to);
        expect(result.isSome() && result.value).toBe(steps);
      });

      it("counts the same number of intervals as stepping through previousAnchor", () => {
        // Mirror of the forward case: stepping backward from 2024-02-05 through the
        // index-aware grid is 02-05, 01-29, 01-22, 01-15, 01-01 — 4 steps, not the 5 a raw
        // 7-day stepping (ignoring the extension) would produce.
        const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
        const index = c.resolve(JournalsIndex);
        index.register({
          journalName: "s",
          anchor: "2024-01-01" as AnchorString,
          path: "S/1.md" as VaultPath,
          endDate: "2024-01-14" as AnchorString,
        });
        const cycle = c.resolve(CycleService);
        const to = "2024-01-01" as AnchorString;
        let current = "2024-02-05" as AnchorString;
        let steps = 0;
        // Capped so a stalled previousAnchor fails the test below rather than hanging the run.
        const maxSteps = 8;
        while (current > to && steps < maxSteps) {
          current = unwrap(cycle.previousAnchor("s", current));
          steps++;
        }
        expect(current).toBe(to);
        expect(steps).toBe(4);
        const result = cycle.countRepeats("s", "2024-02-05" as AnchorString, to);
        expect(result.isSome() && result.value).toBe(-steps);
      });
    });
  });

  describe("anchorAtOffset", () => {
    it("advances a custom anchor forward by the given number of intervals", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const cycle = c.resolve(CycleService);
      const result = cycle.anchorAtOffset("s", "2024-01-01" as AnchorString, 3);
      expect(result.isSome() && result.value).toBe("2024-01-22");
    });

    it("steps a custom anchor backward for a negative offset", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const cycle = c.resolve(CycleService);
      const result = cycle.anchorAtOffset("s", "2024-01-22" as AnchorString, -3);
      expect(result.isSome() && result.value).toBe("2024-01-01");
    });

    it("returns the same anchor for a zero offset", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const cycle = c.resolve(CycleService);
      const result = cycle.anchorAtOffset("s", "2024-01-08" as AnchorString, 0);
      expect(result.isSome() && result.value).toBe("2024-01-08");
    });

    it("inverts countRepeats for a fixed cycle", () => {
      const c = buildContainer({ d: fixedJournal("d", { type: "day" }) });
      const cycle = c.resolve(CycleService);
      const result = cycle.anchorAtOffset("d", "2024-01-01" as AnchorString, 3);
      expect(result.isSome() && result.value).toBe("2024-01-04");
    });

    it("returns None for an unknown journal", () => {
      const c = buildContainer({});
      const cycle = c.resolve(CycleService);
      expect(cycle.anchorAtOffset("missing", "2024-01-01" as AnchorString, 2).isNone()).toBe(true);
    });
  });

  describe("isCanonicalAnchor", () => {
    it("accepts any date for a fixed daily journal", () => {
      const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
      const cycle = c.resolve(CycleService);
      const result = cycle.isCanonicalAnchor("daily", "2024-06-15" as AnchorString);
      expect(result.isSome() && result.value).toBe(true);
    });

    it("rejects a non-first-of-month date for a fixed monthly journal", () => {
      const c = buildContainer({ m: fixedJournal("m", { type: "month" }) });
      const cycle = c.resolve(CycleService);
      const result = cycle.isCanonicalAnchor("m", "2024-06-15" as AnchorString);
      expect(result.isSome() && result.value).toBe(false);
    });

    it("accepts the first-of-month date for a fixed monthly journal", () => {
      const c = buildContainer({ m: fixedJournal("m", { type: "month" }) });
      const cycle = c.resolve(CycleService);
      const result = cycle.isCanonicalAnchor("m", "2024-06-01" as AnchorString);
      expect(result.isSome() && result.value).toBe(true);
    });

    it("rejects an off-grid date for a custom interval journal", () => {
      const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
      const cycle = c.resolve(CycleService);
      const result = cycle.isCanonicalAnchor("s", "2024-02-20" as AnchorString);
      expect(result.isSome() && result.value).toBe(false);
    });

    it("accepts an on-grid date for a custom interval journal", () => {
      const c = buildContainer({ s: customJournal("s", "month", 1, "2024-01-15") });
      const cycle = c.resolve(CycleService);
      const result = cycle.isCanonicalAnchor("s", "2024-02-15" as AnchorString);
      expect(result.isSome() && result.value).toBe(true);
    });

    it("returns None for an unknown journal", () => {
      const c = buildContainer({});
      const cycle = c.resolve(CycleService);
      expect(cycle.isCanonicalAnchor("missing", "2024-06-01" as AnchorString).isNone()).toBe(true);
    });
  });
});
