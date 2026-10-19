import { describe, expect, it, vi } from "vitest";

import { DayPeriod, WeekPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { date } from "@/calendar/testing";
import { NoteMetadataService, NoteSizeService, NoteStructureService } from "@/infrastructure/host";
import type { NoteSize, NoteStructure, VaultPath } from "@/infrastructure/host";
import { FakeNoteSizeService, FakeNoteStructureService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { TaskIndex } from "@/tasks";
import type { TaskItem, TaskQuestion, TaskStatus } from "@/tasks";
import type { TaskCondition, TaskRule } from "@/tasks/conditions";
import { tasksCoreModule } from "@/tasks/module";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { cellKey, DecorationEngine } from "./engine";
import { decorationsModule } from "./module";
import { decorationsSettingsCoreModule } from "./settings/module";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

import type { JournalDecoration } from "./config";

async function buildHarness(
  journals: Record<string, JournalConfig> = {},
): Promise<{ harness: TestHarness; size: FakeNoteSizeService; structures: FakeNoteStructureService }> {
  const size = new FakeNoteSizeService();
  const structures = new FakeNoteStructureService();
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule, tasksCoreModule],
    data: { journals, shelves: {}, decorations: { decorations: [] } },
    overrides: [
      overrideWith(NoteSizeService, size as unknown as NoteSizeService),
      overrideWith(NoteStructureService, structures as unknown as NoteStructureService),
    ],
  });
  return { harness, size, structures };
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

function taskItem(status: TaskStatus): TaskItem {
  return {
    provider: "test",
    key: `test:${status}`,
    path: NOTE_PATH,
    status,
    relations: ["containment"],
    capabilities: { movable: true, stampable: true, retargetable: false },
    display: { kind: "line", path: NOTE_PATH, line: 0, endLine: 0, parentLine: null, markdown: null },
    dates: {},
  };
}

const NOTELET_TASK_PATH = "journals/notelets/standup.md" as VaultPath;

function taskNote(path: VaultPath, status: TaskStatus, scheduled: string): TaskItem {
  return {
    provider: "note-property",
    key: `note-property:${path}`,
    path,
    status,
    relations: ["date"],
    capabilities: { movable: false, stampable: false, retargetable: true },
    display: { kind: "note", path, title: path },
    dates: { scheduled: scheduled as AnchorString },
  };
}

function taskItemAt(path: VaultPath, status: TaskStatus, line = 0): TaskItem {
  const item = taskItem(status);
  return {
    ...item,
    path,
    key: `${path}:${status}`,
    display: { kind: "line", path, line, endLine: line, parentLine: null, markdown: null },
  };
}

async function evaluateTaskCondition(
  questions: Partial<TaskQuestion> | Partial<TaskQuestion>[],
  options: {
    registerNote: boolean;
    items?: readonly TaskStatus[];
    noteletItems?: readonly TaskStatus[];
    // Task notes scheduled on the evaluated day, each its own note outside the journal.
    taskNotes?: readonly TaskStatus[];
    journalFilter?: TaskRule;
    structure?: NoteStructure;
    observe?: (structures: FakeNoteStructureService) => void;
  },
): Promise<Map<string, unknown>> {
  const decoration = buildDecoration({
    mode: "and",
    conditions: [questions].flat().map((q) => buildCondition("tasks", q)),
    styles: [buildStyle("background")],
  });
  const { harness, structures } = await buildHarness({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      {
        decorations: [decoration],
        tasks: { providers: {}, filter: options.journalFilter ?? { mode: "and", conditions: [] } },
      },
    ),
  });
  const period = DayPeriod.containing(date("2026-05-25"));
  const index = harness.resolve(JournalsIndex);
  if (options.registerNote) {
    index.register({ journalName: "daily", anchor: period.anchor.toAnchor(), path: NOTE_PATH });
  }
  if (options.structure) structures.setStructure(NOTE_PATH, options.structure);
  options.observe?.(structures);
  if (options.items) {
    harness.resolve(TaskIndex).publish(
      "test",
      { path: NOTE_PATH },
      options.items.map((s) => taskItemAt(NOTE_PATH, s, options.structure ? 2 : 0)),
    );
  }
  if (options.noteletItems) {
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: period.anchor.toAnchor(),
      path: NOTELET_TASK_PATH,
      typeName: "Standup",
      typeId: "nt_a" as TypeId,
    });
    harness.resolve(TaskIndex).publish(
      "test",
      { path: NOTELET_TASK_PATH },
      options.noteletItems.map((s) => taskItemAt(NOTELET_TASK_PATH, s)),
    );
  }
  const taskNotes = options.taskNotes ?? [];
  for (const [position, status] of taskNotes.entries()) {
    const path = `Tasks/task-${position}.md` as VaultPath;
    harness.resolve(TaskIndex).publish("note-property", { path }, [taskNote(path, status, "2026-05-25")]);
  }
  return harness
    .resolve(DecorationEngine)
    .evaluateRange([period], [{ kind: "journal", journalName: "daily", index: 0, decoration }]);
}

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
        options: { registerNotelet: string | null; registerNote?: boolean; noteletAnchor?: string },
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
            anchor: (options.noteletAnchor ?? "2026-05-25") as AnchorString,
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

      it("does not match has-notelet when the notelet sits on another period", async () => {
        const result = await evaluateNotelet([], { registerNotelet: "nt_a", noteletAnchor: "2026-05-26" });
        expect(result.size).toBe(0);
      });

      it("matches has-notelet only for the configured type id", async () => {
        const matching = await evaluateNotelet(["nt_a"], { registerNotelet: "nt_a" });
        const other = await evaluateNotelet(["nt_zzz"], { registerNotelet: "nt_a" });
        expect(matching.size).toBe(1);
        expect(other.size).toBe(0);
      });
    });

    describe("tasks condition", () => {
      it("does not match any open when there is no note", async () => {
        const result = await evaluateTaskCondition({ status: "open" }, { registerNote: false });
        expect(result.size).toBe(0);
      });

      it("matches any open when the index carries an open item for the note", async () => {
        const result = await evaluateTaskCondition({ status: "open" }, { registerNote: true, items: ["todo"] });
        expect(result.size).toBe(1);
      });

      it("does not match any open when every item is done", async () => {
        const result = await evaluateTaskCondition({ status: "open" }, { registerNote: true, items: ["done"] });
        expect(result.size).toBe(0);
      });

      it("does not match all done when the note has no items in the index", async () => {
        const result = await evaluateTaskCondition(
          { quantifier: "all", status: "done" },
          { registerNote: true, items: [] },
        );
        expect(result.size).toBe(0);
      });

      it("matches all done when every item is done", async () => {
        const result = await evaluateTaskCondition(
          { quantifier: "all", status: "done" },
          { registerNote: true, items: ["done", "cancelled"] },
        );
        expect(result.size).toBe(1);
      });

      it("does not match all done when an item is only in progress", async () => {
        const result = await evaluateTaskCondition(
          { quantifier: "all", status: "done" },
          { registerNote: true, items: ["in-progress"] },
        );
        expect(result.size).toBe(0);
      });

      it("leaves a day with no note undecorated for none open", async () => {
        const result = await evaluateTaskCondition({ quantifier: "none", status: "open" }, { registerNote: false });
        expect(result.size).toBe(0);
      });

      it("decorates a day with no note when an open task note is scheduled on it", async () => {
        const result = await evaluateTaskCondition({ status: "open" }, { registerNote: false, taskNotes: ["todo"] });
        expect(result.size).toBe(1);
      });

      it("decorates none open on a day with no note when only a done task note is scheduled on it", async () => {
        const result = await evaluateTaskCondition(
          { quantifier: "none", status: "open" },
          { registerNote: false, taskNotes: ["done"] },
        );
        expect(result.size).toBe(1);
      });

      it("does not decorate a task note by a date the question does not name", async () => {
        const result = await evaluateTaskCondition(
          { status: "open", date: "due" },
          { registerNote: false, taskNotes: ["todo"] },
        );
        expect(result.size).toBe(0);
      });

      it("decorates the week holding a task note's date, not only the day it opens on", async () => {
        const decoration = buildDecoration({
          mode: "and",
          conditions: [buildCondition("tasks", { status: "open" })],
          styles: [buildStyle("background")],
        });
        const { harness } = await buildHarness({
          weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }),
        });
        const path = "Tasks/midweek.md" as VaultPath;
        const week = WeekPeriod.containing(date("2026-05-27"));
        expect(week.start.toAnchor()).not.toBe("2026-05-27");
        harness.resolve(TaskIndex).publish("note-property", { path }, [taskNote(path, "todo", "2026-05-27")]);
        const result = harness
          .resolve(DecorationEngine)
          .evaluateRange([week], [{ kind: "journal", journalName: "weekly", index: 0, decoration }]);
        expect(result.size).toBe(1);
      });

      it("decorates a day holding only a notelet with an open item when the source is both", async () => {
        const result = await evaluateTaskCondition(
          { status: "listing", source: "both" },
          { registerNote: false, noteletItems: ["todo"] },
        );
        expect(result.size).toBe(1);
      });

      it("ignores a notelet's items when the source is the note alone", async () => {
        const result = await evaluateTaskCondition(
          { status: "listing", source: "note" },
          { registerNote: true, items: [], noteletItems: ["todo"] },
        );
        expect(result.size).toBe(0);
      });

      it("applies the journal's task filter to the listing status", async () => {
        const result = await evaluateTaskCondition(
          { status: "listing" },
          {
            registerNote: true,
            items: ["todo"],
            journalFilter: {
              mode: "and",
              conditions: [{ type: "status", condition: "is", statuses: ["done"] }],
            },
          },
        );
        expect(result.size).toBe(0);
      });

      describe("heading filter on the journal", () => {
        const underWork: NoteStructure = {
          listItems: [{ marker: " ", line: 2, endLine: 2, parent: null }],
          tags: [],
          headings: [{ heading: "Work", level: 1, line: 0 }],
          frontmatterTags: [],
        };
        const excludeWork: TaskRule = {
          mode: "and",
          conditions: [{ type: "heading", condition: "not-under", headings: ["Work"] }],
        };

        it("leaves the day undecorated when the only open item sits under an excluded heading", async () => {
          const result = await evaluateTaskCondition(
            { status: "open" },
            { registerNote: true, items: ["todo"], structure: underWork, journalFilter: excludeWork },
          );
          expect(result.size).toBe(0);
        });

        it("decorates the day when the same item sits under an admitted heading", async () => {
          const result = await evaluateTaskCondition(
            { status: "open" },
            {
              registerNote: true,
              items: ["todo"],
              structure: { ...underWork, headings: [{ heading: "Home", level: 1, line: 0 }] },
              journalFilter: excludeWork,
            },
          );
          expect(result.size).toBe(1);
        });
      });

      it("never reads the note's structure for a question with no heading or tag condition", async () => {
        const reads: string[] = [];
        await evaluateTaskCondition(
          { status: "open" },
          {
            registerNote: true,
            items: ["todo"],
            observe: (structures) => {
              const original = structures.get.bind(structures);
              vi.spyOn(structures, "get").mockImplementation((path) => {
                reads.push(path);
                return original(path);
              });
            },
          },
        );
        expect(reads).toEqual([]);
      });

      it("reads the note's structure once for two conditions on the same cell", async () => {
        const reads: string[] = [];
        const heading: TaskCondition = { type: "heading", condition: "under", headings: ["Home"] };
        await evaluateTaskCondition(
          [
            { status: "open", filter: { mode: "and", conditions: [heading] } },
            { quantifier: "none", status: "done", filter: { mode: "and", conditions: [heading] } },
          ],
          {
            registerNote: true,
            items: ["todo"],
            observe: (structures) => {
              const original = structures.get.bind(structures);
              vi.spyOn(structures, "get").mockImplementation((path) => {
                reads.push(path);
                return original(path);
              });
            },
          },
        );
        expect(reads).toEqual([NOTE_PATH]);
      });

      it("evaluates two tasks conditions independently", async () => {
        const both = await evaluateTaskCondition(
          [
            { quantifier: "any", status: "open" },
            { quantifier: "none", status: "done" },
          ],
          { registerNote: true, items: ["todo"] },
        );
        const second = await evaluateTaskCondition(
          [
            { quantifier: "any", status: "open" },
            { quantifier: "none", status: "done" },
          ],
          { registerNote: true, items: ["todo", "done"] },
        );
        expect(both.size).toBe(1);
        expect(second.size).toBe(0);
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
