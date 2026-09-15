import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestContainerOptions, type TestHarness } from "@/testing";

import { importCoreModule } from "./module";
import { ImportPlanner } from "./planner";
import { buildCalendarSet, buildPeriodicConfig, periodicNotesStorePlugin } from "./testing";

async function harnessWith(data: TestContainerOptions["data"] = {}): Promise<TestHarness> {
  return testContainer({ modules: [journalsCoreModule, importCoreModule], data });
}

function withPeriodicNotesSets(harness: TestHarness, sets: Record<string, unknown>[]): void {
  harness.host.putPlugin("periodic-notes", periodicNotesStorePlugin({ calendarSets: sets }));
}

describe("ImportPlanner", () => {
  describe("rows", () => {
    it("names a new daily journal after its period", async () => {
      const harness = await harnessWith();
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
      ]);

      const plan = harness.resolve(ImportPlanner).plan();

      expect(plan.rows.map((row) => row.name)).toEqual([m.import_journal_name({ period: "day" })]);
    });

    it("moves the date format's leading folders into the folder", async () => {
      const harness = await harnessWith();
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal", format: "YYYY/MM-MMM/DD-ddd" }) }),
      ]);

      const [row] = harness.resolve(ImportPlanner).plan().rows;

      expect({ folder: row?.folder, dateFormat: row?.dateFormat }).toEqual({
        folder: "Journal/{{date:YYYY}}/{{date:MM-MMM}}",
        dateFormat: "DD-ddd",
      });
    });

    it("numbers a name another journal already uses", async () => {
      const taken = m.import_journal_name({ period: "day" });
      const harness = await harnessWith({
        journals: { [taken]: fixedJournal(taken, { type: "day" }, { folder: "Elsewhere" }) },
      });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
      ]);

      const [row] = harness.resolve(ImportPlanner).plan().rows;

      expect(row?.name).toBe(m.import_journal_name_indexed({ name: taken, index: 2 }));
    });

    it("recognizes an existing journal that writes the same paths under another name", async () => {
      const harness = await harnessWith({
        journals: {
          days: fixedJournal(
            "days",
            { type: "day" },
            { folder: "Journal", dateFormat: "YYYY-MM-DD", nameTemplate: "{{date}}" },
          ),
        },
      });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
      ]);

      const [row] = harness.resolve(ImportPlanner).plan().rows;

      expect(row?.state).toEqual({ kind: "set-up", journalName: "days" });
    });

    it("does not count a journal in the same folder with another format as set up", async () => {
      const harness = await harnessWith({
        journals: {
          days: fixedJournal(
            "days",
            { type: "day" },
            { folder: "Journal", dateFormat: "DD-MM-YYYY", nameTemplate: "{{date}}" },
          ),
        },
      });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
      ]);

      const [row] = harness.resolve(ImportPlanner).plan().rows;

      expect(row?.state).toEqual({ kind: "new" });
    });

    it("recognizes an existing weekly journal with the default week format as set up", async () => {
      const harness = await harnessWith({
        journals: {
          weeks: fixedJournal(
            "weeks",
            { type: "week" },
            { folder: "Journal", dateFormat: "gggg-[W]ww", nameTemplate: "{{date}}" },
          ),
        },
      });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { week: buildPeriodicConfig({ folder: "Journal" }) }),
      ]);

      const [row] = harness.resolve(ImportPlanner).plan().rows;

      expect(row?.state).toEqual({ kind: "set-up", journalName: "weeks" });
    });

    // Under the test locale's default week grid (western: dow=0, doy=6, seeded from moment's
    // built-in "en" locale), a week's representative day is 6 days after its start — so a
    // day-of-month-sensitive format renders a different string for the two, and comparing by
    // `startOf` alone would miss an otherwise identical weekly journal.
    it("recognizes a day-sensitive weekly format as set up despite the week's representative day differing from its start", async () => {
      const harness = await harnessWith({
        journals: {
          weeks: fixedJournal(
            "weeks",
            { type: "week" },
            { folder: "Journal", dateFormat: "YYYY-MM-DD", nameTemplate: "{{date}}" },
          ),
        },
      });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { week: buildPeriodicConfig({ folder: "Journal", format: "YYYY-MM-DD" }) }),
      ]);

      const [row] = harness.resolve(ImportPlanner).plan().rows;

      expect(row?.state).toEqual({ kind: "set-up", journalName: "weeks" });
    });

    it("proposes Daily notes' day journal unticked when Periodic Notes writes days", async () => {
      const harness = await harnessWith();
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
      ]);
      harness.host.putCorePlugin("daily-notes", { options: { folder: "Daily" } });

      const plan = harness.resolve(ImportPlanner).plan();

      expect(plan.rows.find((row) => row.journal.source === "daily-notes")?.state).toEqual({
        kind: "superseded",
        by: "periodic-notes",
      });
    });
  });

  describe("shelves", () => {
    it("creates no shelf for a single calendar set", async () => {
      const harness = await harnessWith();
      withPeriodicNotesSets(harness, [buildCalendarSet("Default", { day: buildPeriodicConfig() })]);

      expect(harness.resolve(ImportPlanner).plan().shelves).toEqual([]);
    });

    it("shelves each calendar set's journals when there are several", async () => {
      const harness = await harnessWith();
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
        buildCalendarSet("Work", { day: buildPeriodicConfig({ folder: "Work" }) }),
      ]);

      const plan = harness.resolve(ImportPlanner).plan();

      expect({
        shelves: plan.shelves,
        rows: plan.rows.map((row) => ({ name: row.name, shelf: row.shelf })),
      }).toEqual({
        shelves: ["Default", "Work"],
        rows: [
          { name: m.import_journal_name_in_set({ set: "Default", period: "day" }), shelf: "Default" },
          { name: m.import_journal_name_in_set({ set: "Work", period: "day" }), shelf: "Work" },
        ],
      });
    });
  });
});
