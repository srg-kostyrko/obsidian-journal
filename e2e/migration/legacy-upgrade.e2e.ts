import { browser, expect } from "@wdio/globals";

import {
  getSettings,
  journalKeysOf,
  journalNamesOf,
  shelfKeysOf,
  waitForSettingsVersion,
} from "../support/plugin-data.js";
import { frontmatterOf } from "../support/vault.js";

import { waitForMigratedIntervalNote, waitForMigratedNote } from "./helpers.js";

// The migration rewrites journal-date to the period's *canonical anchor*, not the
// legacy start date verbatim — so a note whose old start date sits mid-period
// (a week's Tuesday, a month's 5th, a quarter's February, a year's June) lands on
// the anchor v3 accepts (a week's representative Thursday, the 1st, Jan 1). Writing
// the raw start date would leave the note non-canonical and orphaned. Fixture week
// config is ISO (firstDayOfWeek 1, firstWeekOfYear 4), so the week anchor is Thursday.
const calendarNotes = [
  { section: "day", journal: "My Journal Day", path: "archive/day-note.md", date: "2024-03-10" },
  { section: "week", journal: "My Journal Week", path: "archive/week-note.md", date: "2024-03-14" },
  { section: "month", journal: "My Journal Month", path: "archive/month-note.md", date: "2024-03-01" },
  { section: "quarter", journal: "My Journal Quarter", path: "archive/quarter-note.md", date: "2024-01-01" },
  { section: "year", journal: "My Journal Year", path: "archive/year-note.md", date: "2024-01-01" },
];

// Slice C — the migration seam. The `e2e-legacy-v1` fixture commits a real
// pre-v3 data.json (a calendar journal split across all five sections plus an
// interval journal) and one legacy note per journal type carrying the old
// `journal`/`journal-section`/`journal-interval-index` frontmatter. Booting the
// freshly built plugin must run the real loadData -> migration chain -> saveData
// round-trip and walk the vault rewriting legacy note frontmatter through
// metadataCache. Neither path exists against __mocks__/obsidian.ts, which fakes
// plugin-data persistence and the index.
describe("legacy vault upgrade", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-legacy-v1", plugins: ["journals"] });
  });

  it("upgrades the stored data.json to the current settings version", async () => {
    await waitForSettingsVersion(4);
  });

  it("preserves every legacy journal under its migrated name", async () => {
    await waitForSettingsVersion(4);
    const settings = await getSettings();

    expect(journalNamesOf(settings)).toEqual(
      expect.arrayContaining([
        "My Journal Day",
        "My Journal Week",
        "My Journal Month",
        "My Journal Quarter",
        "My Journal Year",
        "Sprints",
      ]),
    );
  });

  it("keys migrated journals by name so the plugin can resolve them", async () => {
    await waitForSettingsVersion(4);
    const settings = await getSettings();

    expect(journalKeysOf(settings)).toEqual(expect.arrayContaining(["My Journal Day", "Sprints"]));
  });

  it("registers migrated commands under their v2-era Obsidian ids", async () => {
    // Obsidian persists user hotkeys keyed by the full command id; v2 registered the
    // seeded "Open today's note" as journals::open-today's-note. The migration must
    // key the command so the same id re-registers, or every v2 hotkey silently unbinds.
    await waitForSettingsVersion(4);
    const registered = await browser.executeObsidian(({ app }, id) => {
      const runtime = app as unknown as { commands: { findCommand(id: string): unknown } };
      return runtime.commands.findCommand(id) !== undefined && runtime.commands.findCommand(id) !== null;
    }, "journals::open-today's-note");
    expect(registered).toBe(true);
  });

  it("keys the migrated shelf by name", async () => {
    await waitForSettingsVersion(4);
    const settings = await getSettings();

    expect(shelfKeysOf(settings)).toEqual(["My Journal"]);
  });

  for (const { section, journal, path, date } of calendarNotes) {
    it(`rewrites a legacy ${section} note to its migrated journal and date field`, async () => {
      await waitForMigratedNote(path, { journal, date });
    });
  }

  it("rewrites a legacy interval note, moving its index into the configured field", async () => {
    // 2024-03-10 falls mid-interval; the canonical anchor is the interval start
    // (Sprints: 2-week cycle from 2022-02-01 → the block containing it starts 2024-02-27).
    await waitForMigratedIntervalNote("archive/sprint-note.md", {
      journal: "Sprints",
      date: "2024-02-27",
      index: 3,
    });
  });

  it("leaves a note without journal frontmatter untouched", async () => {
    // A migrated note is the deterministic checkpoint: once it converges, the
    // migration walk has demonstrably run, so the absence on the unrelated note is
    // a real negative rather than an unobserved race.
    await waitForMigratedNote("archive/day-note.md", { journal: "My Journal Day", date: "2024-03-10" });

    const frontmatter = await frontmatterOf("notes/groceries.md");

    expect(frontmatter?.journal).toBeUndefined();
  });
});
