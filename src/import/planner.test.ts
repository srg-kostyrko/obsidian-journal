import { describe, expect, it } from "vitest";

import { Calendar, calendarSettingsModule } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { startupModule } from "@/journals/startup/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestContainerOptions, type TestHarness } from "@/testing";

import { importCoreModule } from "./module";
import { hasAnythingToImport, ImportPlanner } from "./planner";
import { buildCalendarSet, buildImportPlan, buildPeriodicConfig, periodicNotesStorePlugin } from "./testing";

async function harnessWith(data: TestContainerOptions["data"] = {}): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, importCoreModule, calendarSettingsModule, startupModule],
    data,
  });
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

    it("names a row that is already set up after the journal that sets it up", async () => {
      const taken = m.import_journal_name({ period: "day" });
      const harness = await harnessWith({
        journals: {
          [taken]: fixedJournal(
            taken,
            { type: "day" },
            { folder: "Journal", dateFormat: "YYYY-MM-DD", nameTemplate: "{{date}}" },
          ),
        },
      });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
      ]);

      const [row] = harness.resolve(ImportPlanner).plan().rows;

      expect(row?.name).toBe(taken);
    });

    it("keeps a row that is already set up from taking a name a later row would get", async () => {
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
      harness.host.putCorePlugin("daily-notes", { options: { folder: "Daily" } });

      const plan = harness.resolve(ImportPlanner).plan();

      expect(plan.rows.find((row) => row.journal.source === "daily-notes")?.name).toBe(
        m.import_journal_name({ period: "day" }),
      );
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

    it("proposes Daily notes' day journal switched off when Periodic Notes writes days", async () => {
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

  describe("sources", () => {
    it("reports a plugin whose settings throw when read as unrecognised", async () => {
      const harness = await harnessWith();
      harness.host.putPlugin("periodic-notes", {
        get settings(): unknown {
          throw new Error("settings are not ready");
        },
      });

      expect(harness.resolve(ImportPlanner).plan().unrecognised).toEqual(["periodic-notes"]);
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

  describe("week start", () => {
    it("offers Calendar's week start as custom weeks from that day, keeping the current first-week rule", async () => {
      const harness = await harnessWith({ calendar: { mode: "custom", dow: 1, doy: 4, global: false } });
      harness.host.putPlugin("calendar", { options: { weekStart: "sunday" } });

      expect(harness.resolve(ImportPlanner).plan().weekStart).toEqual({
        kind: "offer",
        next: { mode: "custom", dow: 0, doy: 4, global: false },
        tickedByDefault: true,
      });
    });

    it("leaves the week start switched off once a weekly journal has a connected note", async () => {
      const harness = await harnessWith({
        calendar: { mode: "custom", dow: 1, doy: 4, global: false },
        journals: { weekly: fixedJournal("weekly", { type: "week" }) },
      });
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "weekly", anchor: anchor("2026-01-05"), path: "Weekly/2026-W02.md" as VaultPath });
      harness.host.putPlugin("calendar", { options: { weekStart: "sunday" } });

      const weekStart = harness.resolve(ImportPlanner).plan().weekStart;

      expect(weekStart.kind === "offer" && weekStart.tickedByDefault).toBe(false);
    });

    it("reports a week start the current first-week rule cannot express as not applicable", async () => {
      const harness = await harnessWith({ calendar: { mode: "custom", dow: 1, doy: 4, global: false } });
      harness.host.putPlugin("calendar", { options: { weekStart: "saturday" } });

      expect(harness.resolve(ImportPlanner).plan().weekStart).toEqual({ kind: "not-applicable", dow: 6 });
    });

    it("offers nothing when Calendar's week start already matches", async () => {
      const harness = await harnessWith({ calendar: { mode: "custom", dow: 0, doy: 4, global: false } });
      harness.host.putPlugin("calendar", { options: { weekStart: "sunday" } });

      expect(harness.resolve(ImportPlanner).plan().weekStart).toEqual({ kind: "unchanged" });
    });

    it("offers custom weeks from Calendar's day even when the locale already starts weeks on it", async () => {
      const harness = await harnessWith();
      const locale = harness.resolve(Calendar).localeWeek();
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      harness.host.putPlugin("calendar", { options: { weekStart: weekdays[locale.dow] } });

      expect(harness.resolve(ImportPlanner).plan().weekStart).toEqual({
        kind: "offer",
        next: { mode: "custom", dow: locale.dow, doy: locale.doy, global: false },
        tickedByDefault: true,
      });
    });

    it("offers nothing for Calendar's default week start over a custom week grid", async () => {
      const harness = await harnessWith({ calendar: { mode: "custom", dow: 1, doy: 4, global: false } });
      harness.host.putPlugin("calendar", { options: { weekStart: "locale" } });

      expect(harness.resolve(ImportPlanner).plan().weekStart).toEqual({ kind: "unchanged" });
    });
  });

  describe("startup journal", () => {
    it("offers the flagged journal while no startup journal is set", async () => {
      const harness = await harnessWith();
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ openAtStartup: true }) }),
      ]);

      const plan = harness.resolve(ImportPlanner).plan();

      expect(plan.startup).toEqual({ kind: "set", rowKey: plan.rows.at(0)?.key });
    });

    it("keeps an existing startup journal", async () => {
      const harness = await harnessWith({
        journals: { mine: fixedJournal("mine", { type: "day" }, { folder: "Mine" }) },
        startup: { journalName: "mine", overrides: [] },
      });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ openAtStartup: true }) }),
      ]);

      expect(harness.resolve(ImportPlanner).plan().startup).toEqual({ kind: "kept", journalName: "mine" });
    });
  });

  describe("warnings", () => {
    it("warns about ISO week numbers under a custom week grid", async () => {
      const harness = await harnessWith({ calendar: { mode: "custom", dow: 0, doy: 6, global: false } });
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { week: buildPeriodicConfig({ format: "GGGG-[W]WW" }) }),
      ]);

      expect(harness.resolve(ImportPlanner).plan().rows.at(0)?.warnings).toEqual([
        { kind: "iso-week-under-custom-grid" },
      ]);
    });

    it("warns about a template note that does not exist", async () => {
      const harness = await harnessWith();
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ templatePath: "Templates/Day" }) }),
      ]);

      expect(harness.resolve(ImportPlanner).plan().rows.at(0)?.warnings).toEqual([
        { kind: "missing-template", path: "Templates/Day" },
      ]);
    });

    it("accepts a template path written without its extension", async () => {
      const harness = await harnessWith();
      harness.host.putFile("Templates/Day.md", "template");
      withPeriodicNotesSets(harness, [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ templatePath: "Templates/Day" }) }),
      ]);

      expect(harness.resolve(ImportPlanner).plan().rows.at(0)?.warnings).toEqual([]);
    });
  });

  describe("hasAnythingToImport", () => {
    it("counts a week start alone as something to import", () => {
      const plan = buildImportPlan({
        rows: [],
        weekStart: { kind: "offer", next: { mode: "custom", dow: 0, doy: 6, global: false }, tickedByDefault: true },
      });

      expect(hasAnythingToImport(plan)).toBe(true);
    });
  });
});
