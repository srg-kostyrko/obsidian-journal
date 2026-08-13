import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DayPeriod, WeekPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { customJournal, fakeRepo, fixedJournal } from "@/journals/testing";

import { cellKey, DecorationEngine } from "./engine";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

function buildContainer(journals: Record<string, JournalConfig> = {}): {
  c: Container;
  metadata: FakeNoteMetadataService;
} {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  const metadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  return { c, metadata };
}

// A fortnightly journal bounded to a single month. Its intervals start 2026-01-05, 2026-01-19,
// 2026-02-02, …, and the offset-1 decoration marks each interval's first day on the day grid —
// a surface that also renders days the journal's timeline never covers.
const sprintDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("offset", { offset: 1 })],
  styles: [buildStyle("background")],
});

function sprintDayCells(day: string): Map<string, unknown> {
  const { c } = buildContainer({
    sprint: customJournal("sprint", "week", 2, "2026-01-05", {
      decorations: [sprintDecoration],
      timeline: { start: "2026-01-05" as AnchorString, end: { kind: "date", date: "2026-02-01" as AnchorString } },
    }),
  });
  return c
    .resolve(DecorationEngine)
    .evaluateRange(
      [DayPeriod.containing(date(day))],
      [{ kind: "journal", journalName: "sprint", index: 0, decoration: sprintDecoration }],
    );
}

describe("DecorationEngine", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("evaluateRange", () => {
    it("returns an empty map for empty inputs", () => {
      const { c } = buildContainer();
      const engine = c.resolve(DecorationEngine);
      expect(engine.evaluateRange([], [])).toEqual(new Map());
    });

    it("returns no entries when has-note condition is unmet (no journal entry seeded)", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.size).toBe(0);
    });

    it("returns no entries when period kind mismatches journal write-type", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer({
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const dayPeriod = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [dayPeriod],
        [{ kind: "journal", journalName: "weekly", index: 0, decoration }],
      );

      expect(result.size).toBe(0);
    });

    it("keeps day and week decorations in separate cells when their anchors coincide", () => {
      const dayDeco = buildDecoration({
        mode: "or",
        conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
        styles: [buildStyle("corner", { placement: "top-left" })],
      });
      const weekDeco = buildDecoration({
        mode: "or",
        conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [dayDeco] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [weekDeco] }),
      });
      const engine = c.resolve(DecorationEngine);

      const weekPeriod = WeekPeriod.containing(date("2026-05-25"));
      const dayPeriod = DayPeriod.containing(date(weekPeriod.anchor.toAnchor()));
      // Precondition: a week's anchor coincides with one day cell's anchor.
      expect(dayPeriod.anchor.toAnchor()).toBe(weekPeriod.anchor.toAnchor());

      const result = engine.evaluateRange(
        [dayPeriod, weekPeriod],
        [
          { kind: "journal", journalName: "daily", index: 0, decoration: dayDeco },
          { kind: "journal", journalName: "weekly", index: 0, decoration: weekDeco },
        ],
      );

      expect(result.size).toBe(2);
    });

    // The two weekday-against-a-week checks below pin engine behavior that the UI cannot
    // produce: the condition editor offers date/weekday only for day journals, and the write
    // type is fixed once a journal exists. They guard the anchor the engine evaluates against,
    // not a supported configuration.
    it("matches a weekday condition naming the week's first day", () => {
      // A week period evaluates weekday conditions against its anchor, which is its first day
      // (Monday under the ISO test calendar) — not the representative day {{date}} renders.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer({
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const weekPeriod = WeekPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [weekPeriod],
        [{ kind: "journal", journalName: "weekly", index: 0, decoration }],
      );

      expect(result.size).toBe(1);
    });

    it("does not match a weekday condition naming the week's representative day", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [4] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer({
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const weekPeriod = WeekPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [weekPeriod],
        [{ kind: "journal", journalName: "weekly", index: 0, decoration }],
      );

      expect(result.size).toBe(0);
    });

    it("returns no entries when conditions list is empty", () => {
      const decoration = buildDecoration({ styles: [buildStyle("background")] });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.size).toBe(0);
    });

    it("paints a day cell from a calendar decoration", () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer();
      const engine = c.resolve(DecorationEngine);

      // 2026-05-25 is a Monday.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [period],
        [{ kind: "calendar", owner: { kind: "global" }, index: 0, decoration }],
      );

      expect(result.get(cellKey("day", period.anchor.toAnchor()))).toEqual(decoration.styles);
    });

    it("leaves a week cell untouched for a calendar decoration", () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer();
      const engine = c.resolve(DecorationEngine);

      const period = WeekPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [period],
        [{ kind: "calendar", owner: { kind: "global" }, index: 0, decoration }],
      );

      expect(result.size).toBe(0);
    });

    describe("timeline bounds", () => {
      it("paints an interval's first day inside the timeline", () => {
        expect(sprintDayCells("2026-01-19").size).toBe(1);
      });

      it("leaves an interval's first day past the timeline end undecorated", () => {
        expect(sprintDayCells("2026-02-02").size).toBe(0);
      });

      it("leaves an interval's first day before the timeline start undecorated", () => {
        expect(sprintDayCells("2025-12-22").size).toBe(0);
      });
    });

    it("never reads note metadata for a calendar decoration", () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c, metadata } = buildContainer();
      const spy = vi.spyOn(metadata, "get");
      const engine = c.resolve(DecorationEngine);

      engine.evaluateRange(
        [DayPeriod.containing(date("2026-05-25"))],
        [{ kind: "calendar", owner: { kind: "global" }, index: 0, decoration }],
      );

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("explainRange", () => {
    it("labels a contribution with the decoration that produced it", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      // 2026-05-25 is a Monday.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.explainRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.get(cellKey("day", period.anchor.toAnchor()))).toEqual([
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: decoration.styles[0] },
      ]);
    });

    it("returns contributions in cascade order", () => {
      const calendarDecoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const journalDecoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("corner", { placement: "top-left" })],
      });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [journalDecoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      // 2026-05-25 is a Monday.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.explainRange(
        [period],
        [
          { kind: "calendar", owner: { kind: "global" }, index: 0, decoration: calendarDecoration },
          { kind: "journal", journalName: "daily", index: 0, decoration: journalDecoration },
        ],
      );

      const contributions = result.get(cellKey("day", period.anchor.toAnchor()));
      expect(contributions?.map((contribution) => contribution.source.owner.kind)).toEqual(["global", "journal"]);
    });

    it("returns no entry for a period nothing matched", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [2] })],
        styles: [buildStyle("background")],
      });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      // 2026-05-25 is a Monday, so a Tuesday-only weekday condition never matches.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.explainRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.has(cellKey("day", period.anchor.toAnchor()))).toBe(false);
    });

    it("omits a decoration that matches with no styles", () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [],
      });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      // 2026-05-25 is a Monday, so the condition matches; the decoration still contributes nothing.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.explainRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.has(cellKey("day", period.anchor.toAnchor()))).toBe(false);
    });
  });
});
