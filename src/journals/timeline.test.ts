import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CalendarDate, DayPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { JournalsRepository } from "./repository";
import { customJournal, fakeRepo, fixedJournal, unwrap } from "./testing";
import { TimelineService } from "./timeline";

function buildContainer(journals: Parameters<typeof fakeRepo>[0]): Container {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  return c;
}

describe("TimelineService", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });

  afterEach(() => {
    teardown();
  });

  describe("contains", () => {
    it("returns true for anchor at or after start when end.kind is never", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.contains("daily", "2024-06-15" as AnchorString)).toBe(true);
    });

    it("returns false for anchor before start", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.contains("daily", "2023-12-31" as AnchorString)).toBe(false);
    });

    it("returns false for anchor after end.date", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            timeline: {
              start: "2024-01-01" as AnchorString,
              end: { kind: "date", date: "2024-06-30" as AnchorString },
            },
          },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.contains("daily", "2024-07-01" as AnchorString)).toBe(false);
    });

    it("treats an unset end date as no upper bound", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            timeline: {
              start: "2024-01-01" as AnchorString,
              end: { kind: "date", date: "" as AnchorString },
            },
          },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.contains("daily", "2099-12-31" as AnchorString)).toBe(true);
    });

    it("treats a repeats bound as no bound when the timeline has no start", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            timeline: {
              start: "" as AnchorString,
              end: { kind: "repeats", count: 3 },
            },
          },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.contains("daily", "2024-06-15" as AnchorString)).toBe(true);
    });

    describe("end.kind === repeats", () => {
      it("returns false once count repeats have elapsed", () => {
        // Weekly journal from 2024-01-01 (Mon), count=3.
        // 2024-01-22 is the 4th Mon = 3 repeats elapsed from start → false.
        const c = buildContainer({
          weekly: fixedJournal(
            "weekly",
            { type: "week" },
            {
              timeline: {
                start: "2024-01-01" as AnchorString,
                end: { kind: "repeats", count: 3 },
              },
            },
          ),
        });
        const timeline = c.resolve(TimelineService);
        expect(timeline.contains("weekly", "2024-01-22" as AnchorString)).toBe(false);
      });

      it("returns true when fewer than count repeats have elapsed", () => {
        // 2024-01-15 is the 3rd Mon = 2 repeats from start → true (2 < 3).
        const c = buildContainer({
          weekly: fixedJournal(
            "weekly",
            { type: "week" },
            {
              timeline: {
                start: "2024-01-01" as AnchorString,
                end: { kind: "repeats", count: 3 },
              },
            },
          ),
        });
        const timeline = c.resolve(TimelineService);
        expect(timeline.contains("weekly", "2024-01-15" as AnchorString)).toBe(true);
      });
    });

    it("includes the period containing the start date when the start falls after that period's anchor", () => {
      // Start date Sat 2024-01-06 lies in the week Mon 2024-01-01–Sun 2024-01-07, whose anchor
      // (its first day, Mon 2024-01-01) precedes it. The week that contains the start date must
      // stay in-timeline.
      const c = buildContainer({
        weekly: fixedJournal(
          "weekly",
          { type: "week" },
          { timeline: { start: "2024-01-06" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.contains("weekly", "2024-01-01" as AnchorString)).toBe(true);
    });

    it("returns false for unknown journal", () => {
      const c = buildContainer({});
      const timeline = c.resolve(TimelineService);
      expect(timeline.contains("missing", "2024-06-15" as AnchorString)).toBe(false);
    });
  });

  describe("startOf", () => {
    it("returns the start CalendarDate for a known journal", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const timeline = c.resolve(TimelineService);
      const result = timeline.startOf("daily");
      expect(result.isSome() && result.value.toAnchor()).toBe("2024-01-01");
    });

    it("returns None for unknown journal", () => {
      const c = buildContainer({});
      const timeline = c.resolve(TimelineService);
      expect(timeline.startOf("missing").isNone()).toBe(true);
    });

    it("returns None when the timeline has no start", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.startOf("daily").isNone()).toBe(true);
    });
  });

  describe("endOf", () => {
    it("returns None for end.kind === never", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.endOf("daily").isNone()).toBe(true);
    });

    it("returns Some(date) for end.kind === date", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            timeline: {
              start: "2024-01-01" as AnchorString,
              end: { kind: "date", date: "2024-06-30" as AnchorString },
            },
          },
        ),
      });
      const timeline = c.resolve(TimelineService);
      const result = timeline.endOf("daily");
      expect(result.isSome() && result.value.toAnchor()).toBe("2024-06-30");
    });

    it("returns None for a repeats bound with no timeline start", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            timeline: {
              start: "" as AnchorString,
              end: { kind: "repeats", count: 3 },
            },
          },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.endOf("daily").isNone()).toBe(true);
    });

    it("returns None when the end date is unset", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            timeline: {
              start: "2024-01-01" as AnchorString,
              end: { kind: "date", date: "" as AnchorString },
            },
          },
        ),
      });
      const timeline = c.resolve(TimelineService);
      expect(timeline.endOf("daily").isNone()).toBe(true);
    });

    it("returns the computed end date for end.kind === repeats", () => {
      // Weekly journal starting 2024-01-01, count=3.
      // With test calendar (dow=1, doy=4), a week's anchor is its first day, Monday.
      // Start anchor: anchorOf(2024-01-01) — step count-1=2 times → endOf that anchor.
      const c = buildContainer({
        weekly: fixedJournal(
          "weekly",
          { type: "week" },
          {
            timeline: {
              start: "2024-01-01" as AnchorString,
              end: { kind: "repeats", count: 3 },
            },
          },
        ),
      });
      const cycle = c.resolve(CycleService);
      const startAnchor = unwrap(cycle.anchorOf("weekly", CalendarDate.fromAnchor("2024-01-01" as AnchorString)));
      const anchor1 = unwrap(cycle.nextAnchor("weekly", startAnchor));
      const anchor2 = unwrap(cycle.nextAnchor("weekly", anchor1));
      const expectedEnd = unwrap(cycle.endOf("weekly", anchor2));

      const timeline = c.resolve(TimelineService);
      const result = timeline.endOf("weekly");
      expect(result.isSome() && result.value.toAnchor()).toBe(expectedEnd.toAnchor());
    });

    it("returns None for unknown journal", () => {
      const c = buildContainer({});
      const timeline = c.resolve(TimelineService);
      expect(timeline.endOf("missing").isNone()).toBe(true);
    });
  });

  describe("boundsOf", () => {
    it("leaves both sides open for an unknown journal", () => {
      const c = buildContainer({});
      const bounds = c.resolve(TimelineService).boundsOf("missing");
      expect(bounds.start.isNone() && bounds.end.isNone()).toBe(true);
    });

    it("leaves the lower side open when the timeline has no start", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "" as AnchorString, end: { kind: "never" } } },
        ),
      });
      expect(c.resolve(TimelineService).boundsOf("daily").start.isNone()).toBe(true);
    });

    it("leaves the upper side open when the timeline never ends", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      expect(c.resolve(TimelineService).boundsOf("daily").end.isNone()).toBe(true);
    });

    it("bounds a daily journal at its configured start date", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const bounds = c.resolve(TimelineService).boundsOf("daily");
      expect(bounds.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2024-01-01");
    });

    it("widens the lower bound to the start of the week a mid-week start falls in", () => {
      const c = buildContainer({
        weekly: fixedJournal(
          "weekly",
          { type: "week" },
          { timeline: { start: "2026-06-03" as AnchorString, end: { kind: "never" } } },
        ),
      });
      const bounds = c.resolve(TimelineService).boundsOf("weekly");
      expect(bounds.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-01");
    });

    it("extends the upper bound to the end of the week the timeline end falls in", () => {
      const c = buildContainer({
        weekly: fixedJournal(
          "weekly",
          { type: "week" },
          { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } } },
        ),
      });
      const bounds = c.resolve(TimelineService).boundsOf("weekly");
      expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-07");
    });

    it("keeps the upper bound at the end date when it already closes a period", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } } },
        ),
      });
      const bounds = c.resolve(TimelineService).boundsOf("daily");
      expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-03");
    });

    it("bounds a repeats end at the last repeat", () => {
      const c = buildContainer({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { timeline: { start: "2024-01-01" as AnchorString, end: { kind: "repeats", count: 3 } } },
        ),
      });
      const bounds = c.resolve(TimelineService).boundsOf("daily");
      expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2024-01-03");
    });

    it("agrees with contains at the upper edge", () => {
      const c = buildContainer({
        weekly: fixedJournal(
          "weekly",
          { type: "week" },
          { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } } },
        ),
      });
      const timeline = c.resolve(TimelineService);
      const bounds = timeline.boundsOf("weekly");
      expect(timeline.contains("weekly", "2026-06-01" as AnchorString)).toBe(true);
      expect(bounds.overlapsPeriod(DayPeriod.containing(date("2026-06-05")))).toBe(true);
    });

    it("extends the upper bound to the end of the interval a custom-interval timeline end falls in", () => {
      const c = buildContainer({
        custom: customJournal("custom", "day", 7, "2026-06-01", {
          timeline: { start: "2026-06-01" as AnchorString, end: { kind: "date", date: "2026-06-03" as AnchorString } },
        }),
      });
      const bounds = c.resolve(TimelineService).boundsOf("custom");
      expect(bounds.end.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-07");
    });

    it("rejects the interval past an off-anchor repeats start consistently with contains", () => {
      // Cycle anchored 2026-06-01, stepping every 7 days. A timeline start of 2026-06-03 sits
      // mid-interval; countRepeats must snap it to 2026-06-01 before counting, so 3 repeats
      // covers 06-01–06-21 and the interval starting 06-22 is excluded from both.
      const c = buildContainer({
        custom: customJournal("custom", "day", 7, "2026-06-01", {
          timeline: { start: "2026-06-03" as AnchorString, end: { kind: "repeats", count: 3 } },
        }),
      });
      const timeline = c.resolve(TimelineService);
      const bounds = timeline.boundsOf("custom");
      expect(timeline.contains("custom", "2026-06-22" as AnchorString)).toBe(false);
      expect(bounds.overlapsPeriod(DayPeriod.containing(date("2026-06-22")))).toBe(false);
    });
  });
});
