import { describe, expect, it, vi } from "vitest";

import { DayPeriod, WeekPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { date } from "@/calendar/testing";
import { NoteMetadataService, NoteSizeService } from "@/infrastructure/host";
import type { NoteSize, VaultPath } from "@/infrastructure/host";
import { FakeNoteSizeService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { cellKey, DecorationEngine } from "./engine";
import { decorationsModule } from "./module";
import { decorationsSettingsCoreModule } from "./settings/module";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

import type { JournalDecoration } from "./config";

async function buildHarness(
  journals: Record<string, JournalConfig> = {},
): Promise<{ harness: TestHarness; size: FakeNoteSizeService }> {
  const size = new FakeNoteSizeService();
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: { journals, shelves: {}, decorations: { decorations: [] } },
    overrides: [overrideWith(NoteSizeService, size as unknown as NoteSizeService)],
  });
  return { harness, size };
}

// A fortnightly journal bounded to a single month. Its intervals start 2026-01-05, 2026-01-19,
// 2026-02-02, …, and the offset-1 decoration marks each interval's first day on the day grid —
// a surface that also renders days the journal's timeline never covers.
const sprintDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("offset", { offset: 1 })],
  styles: [buildStyle("background")],
});

async function sprintDayCells(day: string): Promise<Map<string, unknown>> {
  const { harness } = await buildHarness({
    sprint: customJournal("sprint", "week", 2, "2026-01-05", {
      decorations: [sprintDecoration],
      timeline: { start: "2026-01-05" as AnchorString, end: { kind: "date", date: "2026-02-01" as AnchorString } },
    }),
  });
  return harness
    .resolve(DecorationEngine)
    .evaluateRange(
      [DayPeriod.containing(date(day))],
      [{ kind: "journal", journalName: "sprint", index: 0, decoration: sprintDecoration }],
    );
}

const NOTE_PATH = "journals/2026-05-25.md" as VaultPath;

async function evaluateDaily(
  decoration: JournalDecoration,
  options: { registerNote: boolean; size?: NoteSize },
): Promise<Map<string, unknown>> {
  const { harness, size: sizes } = await buildHarness({
    daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
  });
  const period = DayPeriod.containing(date("2026-05-25"));
  if (options.registerNote) {
    harness
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: period.anchor.toAnchor(), path: NOTE_PATH });
  }
  if (options.size !== undefined) sizes.setSize(NOTE_PATH, options.size);
  return harness
    .resolve(DecorationEngine)
    .evaluateRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);
}

describe("DecorationEngine", () => {
  describe("evaluateRange", () => {
    it("returns an empty map for empty inputs", async () => {
      const { harness } = await buildHarness();
      const engine = harness.resolve(DecorationEngine);
      expect(engine.evaluateRange([], [])).toEqual(new Map());
    });

    it("returns no entries when has-note condition is unmet (no journal entry seeded)", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.size).toBe(0);
    });

    it("contributes a matching decoration once when the same cell is listed several times", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [0, 1, 2, 3, 4, 5, 6] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [period, DayPeriod.containing(date("2026-05-25")), period],
        [{ kind: "journal", journalName: "daily", index: 0, decoration }],
      );

      expect(result.get(cellKey(period.kind, period.anchor.toAnchor()))).toHaveLength(1);
    });

    it("returns no entries when period kind mismatches journal write-type", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness({
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      const dayPeriod = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [dayPeriod],
        [{ kind: "journal", journalName: "weekly", index: 0, decoration }],
      );

      expect(result.size).toBe(0);
    });

    it("keeps day and week decorations in separate cells when their anchors coincide", async () => {
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
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [dayDeco] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [weekDeco] }),
      });
      const engine = harness.resolve(DecorationEngine);

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
    it("matches a weekday condition naming the week's first day", async () => {
      // A week period evaluates weekday conditions against its anchor, which is its first day
      // (Monday under the ISO test calendar) — not the representative day {{date}} renders.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness({
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      const weekPeriod = WeekPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [weekPeriod],
        [{ kind: "journal", journalName: "weekly", index: 0, decoration }],
      );

      expect(result.size).toBe(1);
    });

    it("does not match a weekday condition naming the week's representative day", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [4] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness({
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      const weekPeriod = WeekPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [weekPeriod],
        [{ kind: "journal", journalName: "weekly", index: 0, decoration }],
      );

      expect(result.size).toBe(0);
    });

    it("returns no entries when conditions list is empty", async () => {
      const decoration = buildDecoration({ styles: [buildStyle("background")] });
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.size).toBe(0);
    });

    it("paints a day cell from a calendar decoration", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness();
      const engine = harness.resolve(DecorationEngine);

      // 2026-05-25 is a Monday.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [period],
        [{ kind: "calendar", owner: { kind: "global" }, index: 0, decoration }],
      );

      expect(result.get(cellKey("day", period.anchor.toAnchor()))).toEqual(decoration.styles);
    });

    it("leaves a week cell untouched for a calendar decoration", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness();
      const engine = harness.resolve(DecorationEngine);

      const period = WeekPeriod.containing(date("2026-05-25"));
      const result = engine.evaluateRange(
        [period],
        [{ kind: "calendar", owner: { kind: "global" }, index: 0, decoration }],
      );

      expect(result.size).toBe(0);
    });

    describe("timeline bounds", () => {
      it("paints an interval's first day inside the timeline", async () => {
        const result = await sprintDayCells("2026-01-19");
        expect(result.size).toBe(1);
      });

      it("leaves an interval's first day past the timeline end undecorated", async () => {
        const result = await sprintDayCells("2026-02-02");
        expect(result.size).toBe(0);
      });

      it("leaves an interval's first day before the timeline start undecorated", async () => {
        const result = await sprintDayCells("2025-12-22");
        expect(result.size).toBe(0);
      });
    });

    describe("note-size conditions", () => {
      const lessThan100 = buildDecoration({
        mode: "and",
        conditions: [buildCondition("note-size", { condition: "lt", value: 100 })],
        styles: [buildStyle("background")],
      });

      it("does not match a period with no note", async () => {
        const result = await evaluateDaily(lessThan100, { registerNote: false });
        expect(result.size).toBe(0);
      });

      it("does not match a note whose size has not been read yet", async () => {
        const result = await evaluateDaily(lessThan100, { registerNote: true });
        expect(result.size).toBe(0);
      });

      it("matches once the size is known", async () => {
        const result = await evaluateDaily(lessThan100, {
          registerNote: true,
          size: { words: 40, characters: 220 },
        });
        expect(result.size).toBe(1);
      });

      it("does not match when the size is over the threshold", async () => {
        const result = await evaluateDaily(lessThan100, {
          registerNote: true,
          size: { words: 400, characters: 2200 },
        });
        expect(result.size).toBe(0);
      });
    });

    describe("has-notelet conditions", () => {
      const NOTELET_PATH = "journals/2026-05-25.standup.md" as VaultPath;

      async function evaluateNotelet(
        typeIds: string[],
        options: { registerNotelet: string | null; registerNote?: boolean },
      ): Promise<Map<string, unknown>> {
        const decoration = buildDecoration({
          mode: "and",
          conditions: [buildCondition("has-notelet", { typeIds })],
          styles: [buildStyle("background")],
        });
        const { harness } = await buildHarness({
          daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
        });
        const period = DayPeriod.containing(date("2026-05-25"));
        const index = harness.resolve(JournalsIndex);
        if (options.registerNote === true) {
          index.register({ journalName: "daily", anchor: period.anchor.toAnchor(), path: NOTE_PATH });
        }
        if (options.registerNotelet !== null) {
          index.register({
            kind: "notelet",
            journalName: "daily",
            anchor: period.anchor.toAnchor(),
            path: NOTELET_PATH,
            typeName: "Standup",
            typeId: options.registerNotelet as TypeId,
          });
        }
        return harness
          .resolve(DecorationEngine)
          .evaluateRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);
      }

      it("matches has-notelet when the period holds a notelet", async () => {
        const result = await evaluateNotelet([], { registerNotelet: "nt_a" });
        expect(result.size).toBe(1);
      });

      it("does not match has-notelet when the period holds only a period note", async () => {
        const result = await evaluateNotelet([], { registerNotelet: null, registerNote: true });
        expect(result.size).toBe(0);
      });

      it("matches has-notelet only for the configured type id", async () => {
        const matching = await evaluateNotelet(["nt_a"], { registerNotelet: "nt_a" });
        const other = await evaluateNotelet(["nt_zzz"], { registerNotelet: "nt_a" });
        expect(matching.size).toBe(1);
        expect(other.size).toBe(0);
      });
    });

    it("never reads note metadata for a calendar decoration", async () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness();
      const metadata = harness.resolve(NoteMetadataService);
      const spy = vi.spyOn(metadata, "get");
      const engine = harness.resolve(DecorationEngine);

      engine.evaluateRange(
        [DayPeriod.containing(date("2026-05-25"))],
        [{ kind: "calendar", owner: { kind: "global" }, index: 0, decoration }],
      );

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("explainRange", () => {
    it("labels a contribution with the decoration that produced it", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      // 2026-05-25 is a Monday.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.explainRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.get(cellKey("day", period.anchor.toAnchor()))).toEqual([
        { source: { owner: { kind: "journal", journalName: "daily" }, index: 0 }, style: decoration.styles[0] },
      ]);
    });

    it("returns contributions in cascade order", async () => {
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
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [journalDecoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

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

    it("returns no entry for a period nothing matched", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [2] })],
        styles: [buildStyle("background")],
      });
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      // 2026-05-25 is a Monday, so a Tuesday-only weekday condition never matches.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.explainRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.has(cellKey("day", period.anchor.toAnchor()))).toBe(false);
    });

    it("omits a decoration that matches with no styles", async () => {
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [],
      });
      const { harness } = await buildHarness({
        daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }),
      });
      const engine = harness.resolve(DecorationEngine);

      // 2026-05-25 is a Monday, so the condition matches; the decoration still contributes nothing.
      const period = DayPeriod.containing(date("2026-05-25"));
      const result = engine.explainRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);

      expect(result.has(cellKey("day", period.anchor.toAnchor()))).toBe(false);
    });
  });
});
