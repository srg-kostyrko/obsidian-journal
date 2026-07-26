import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DayPeriod, WeekPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { fakeRepo, fixedJournal } from "@/journals/testing";

import { DecorationEngine } from "./engine";
import { buildCondition, buildDecoration, buildStyle } from "./testing";

function buildContainer(journals: Record<string, JournalConfig> = {}): {
  c: Container;
  metadata: FakeNoteMetadataService;
} {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  const metadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  return { c, metadata };
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
      const result = engine.evaluateRange([period], [{ journalName: "daily", decoration }]);

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
      const result = engine.evaluateRange([dayPeriod], [{ journalName: "weekly", decoration }]);

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
          { journalName: "daily", decoration: dayDeco },
          { journalName: "weekly", decoration: weekDeco },
        ],
      );

      expect(result.size).toBe(2);
    });

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
      const result = engine.evaluateRange([weekPeriod], [{ journalName: "weekly", decoration }]);

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
      const result = engine.evaluateRange([weekPeriod], [{ journalName: "weekly", decoration }]);

      expect(result.size).toBe(0);
    });

    it("returns no entries when conditions list is empty (v2 parity)", () => {
      const decoration = buildDecoration({ styles: [buildStyle("background")] });
      const { c } = buildContainer({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = c.resolve(DecorationEngine);

      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange([period], [{ journalName: "daily", decoration }]);

      expect(result.size).toBe(0);
    });
  });
});
