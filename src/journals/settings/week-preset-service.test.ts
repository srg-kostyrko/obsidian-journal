import { beforeEach, describe, expect, it, vi } from "vitest";

import { WeekPeriod, calendarSlice, type AnchorString } from "@/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { date } from "@/calendar/testing";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { CURRENT_VERSION } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { buildNoteletType, customJournal, fixedJournal } from "../testing";

import { journalsSettingsCoreModule } from "./module";
import { WeekPresetService } from "./week-preset-service";

import type { JournalConfig } from "../config";
import type { TypeId } from "../notelets/config";

const ISO = { mode: "custom", dow: 1, doy: 4, global: false } as const;
const WESTERN = { mode: "custom", dow: 0, doy: 6, global: false } as const;

const MODULES = [journalsCoreModule, journalsSettingsCoreModule, calendarSettingsCoreModule];

function weekly(patch: { addStartDate?: boolean; addEndDate?: boolean } = {}): Record<string, JournalConfig> {
  const config = fixedJournal("weekly", { type: "week" });
  return { weekly: { ...config, frontmatter: { ...config.frontmatter, ...patch } } };
}

function weeklyWithNotelet(): Record<string, JournalConfig> {
  const config = fixedJournal("weekly", { type: "week" });
  return { weekly: { ...config, notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } } };
}

function seedWeek(harness: TestHarness, path: string, anchorDate: string, endDate?: string): void {
  const vaultPath = path as VaultPath;
  harness.host.putFile(vaultPath, "", {
    journal: "weekly",
    "journal-date": anchorDate,
    ...(endDate !== undefined && { "journal-end-date": endDate }),
  });
  harness.resolve(JournalsIndex).register({
    journalName: "weekly",
    anchor: anchorDate as AnchorString,
    path: vaultPath,
    ...(endDate !== undefined && { endDate: endDate as AnchorString }),
  });
}

function seedNotelet(harness: TestHarness, path: string, anchorDate: string): void {
  const vaultPath = path as VaultPath;
  harness.host.putFile(vaultPath, "", {
    journal: "weekly",
    "journal-date": anchorDate,
    "journal-notelet": "Standup",
  });
  harness.resolve(JournalsIndex).register({
    kind: "notelet",
    journalName: "weekly",
    anchor: anchorDate as AnchorString,
    path: vaultPath,
    typeName: "Standup",
    typeId: "nt_1" as TypeId,
  });
}

function frontmatterOf(harness: TestHarness, path: string): Record<string, unknown> | undefined {
  return harness.host.files.get(path)?.frontmatter;
}

// Stands in for Obsidian Sync replacing data.json and the plugin's onExternalSettingsChange: the
// new raw lands on "disk", then reload() refreshes every slice from it. Sync rewrites the WHOLE
// file, so the journals collection must ride along unchanged — omitting it here would make
// reload() see no journals at all and wipe the repository, not merely leave the calendar synced.
// Reading the current raw back (rather than taking `journals` as a parameter) means there is
// nothing for a caller to forget to keep in sync with its own testContainer seed.
async function syncCalendar(harness: TestHarness, next: typeof ISO | typeof WESTERN): Promise<void> {
  const loaded = await harness.data.load();
  const current = loaded.isOk() ? (loaded.value as Record<string, unknown>) : {};
  await harness.data.save({ ...current, version: CURRENT_VERSION, calendar: next });
  await harness.settings.reload();
}

describe("WeekPresetService", () => {
  describe("re-anchoring a weekly note", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: MODULES,
        data: { journals: weekly(), calendar: ISO, calendarDisplay: {} },
      });
    });

    it("moves a weekly note's date onto the new grid's week start", async () => {
      seedWeek(harness, "week/2026-W23.md", "2026-06-01");

      await harness.resolve(WeekPresetService).apply(WESTERN);

      expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-date"]).toBe("2026-05-31");
    });

    it("keeps the note's week number across the change", async () => {
      seedWeek(harness, "week/2026-W23.md", "2026-06-01");

      await harness.resolve(WeekPresetService).apply(WESTERN);

      // Read the date the service actually wrote and ask the new grid what week it is —
      // asserting a hardcoded date here would pass without the note being touched at all.
      const written = String(frontmatterOf(harness, "week/2026-W23.md")?.["journal-date"]);
      expect(WeekPeriod.containing(date(written)).weekOfYear).toBe(23);
    });

    it("keeps the week-year of a note whose week straddles January 1", async () => {
      // ISO week 1 of 2026 starts on 2025-12-29; under the Western grid it starts on 2025-12-28.
      seedWeek(harness, "week/2026-W01.md", "2025-12-29");

      await harness.resolve(WeekPresetService).apply(WESTERN);

      expect(frontmatterOf(harness, "week/2026-W01.md")?.["journal-date"]).toBe("2025-12-28");
    });

    it("stores the new preset in the calendar slice", async () => {
      await harness.resolve(WeekPresetService).apply(WESTERN);

      expect(harness.settings.getSlice(calendarSlice).state).toEqual(WESTERN);
    });

    it("leaves weekly notes alone when only the global flag changes", async () => {
      seedWeek(harness, "week/2026-W23.md", "2026-06-01");

      await harness.resolve(WeekPresetService).apply({ ...ISO, global: true });

      expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-date"]).toBe("2026-06-01");
    });
  });

  it("recomputes the start date field against the new grid", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: weekly({ addStartDate: true }), calendar: ISO, calendarDisplay: {} },
    });
    seedWeek(harness, "week/2026-W23.md", "2026-06-01");

    await harness.resolve(WeekPresetService).apply(WESTERN);

    expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-start-date"]).toBe("2026-05-31");
  });

  describe("a stored end date equal to the old grid's own week end", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: MODULES,
        data: { journals: weekly({ addEndDate: true }), calendar: ISO, calendarDisplay: {} },
      });
    });

    it("recomputes the end date field against the new grid", async () => {
      seedWeek(harness, "week/2026-W23.md", "2026-06-01");

      await harness.resolve(WeekPresetService).apply(WESTERN);

      expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-end-date"]).toBe("2026-06-06");
    });

    // Regression: the old grid's own week end ("2026-06-07" for ISO week 23) is period metadata,
    // not a manual extension. Judging it against the NEW grid's default (as opposed to the OLD
    // grid's, captured before the switch) would wrongly read it as an extension and freeze the
    // note on the old grid's end date forever — the exact bug the week-preset e2e spec caught.
    it("recomputes the end date to the new week's own end when the stored value was the old grid's own end", async () => {
      seedWeek(harness, "week/2026-W23.md", "2026-06-01", "2026-06-07");

      await harness.resolve(WeekPresetService).apply(WESTERN);

      expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-end-date"]).toBe("2026-06-06");
    });
  });

  describe("a stored end date with addEndDate off", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: MODULES,
        data: { journals: weekly({ addEndDate: false }), calendar: ISO, calendarDisplay: {} },
      });
    });

    it("keeps a manually extended end date across a grid change", async () => {
      seedWeek(harness, "week/2026-W23.md", "2026-06-01", "2026-06-21");

      await harness.resolve(WeekPresetService).apply(WESTERN);

      expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-end-date"]).toBe("2026-06-21");
    });

    it("drops a stored end date that was only the old grid's own week end when addEndDate is off", async () => {
      seedWeek(harness, "week/2026-W23.md", "2026-06-01", "2026-06-07");

      await harness.resolve(WeekPresetService).apply(WESTERN);

      expect("journal-end-date" in (frontmatterOf(harness, "week/2026-W23.md") ?? {})).toBe(false);
    });
  });

  it("leaves a month journal's notes alone", async () => {
    const monthly = fixedJournal("monthly", { type: "month" });
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { ...weekly(), monthly }, calendar: ISO, calendarDisplay: {} },
    });
    harness.host.putFile("month/2026-06.md", "", { journal: "monthly", "journal-date": "2026-06-01" });
    harness.resolve(JournalsIndex).register({
      journalName: "monthly",
      anchor: "2026-06-01" as AnchorString,
      path: "month/2026-06.md" as VaultPath,
    });

    await harness.resolve(WeekPresetService).apply(WESTERN);

    expect(frontmatterOf(harness, "month/2026-06.md")?.["journal-date"]).toBe("2026-06-01");
  });

  it("leaves a custom weekly interval's notes alone", async () => {
    const sprints = customJournal("sprints", "week", 2, "2026-06-01");
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { ...weekly(), sprints }, calendar: ISO, calendarDisplay: {} },
    });
    harness.host.putFile("sprints/1.md", "", { journal: "sprints", "journal-date": "2026-06-01" });
    harness.resolve(JournalsIndex).register({
      journalName: "sprints",
      anchor: "2026-06-01" as AnchorString,
      path: "sprints/1.md" as VaultPath,
    });

    await harness.resolve(WeekPresetService).apply(WESTERN);

    expect(frontmatterOf(harness, "sprints/1.md")?.["journal-date"]).toBe("2026-06-01");
  });

  it("re-anchors a weekly journal's notelets when the grid moves", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: weeklyWithNotelet(), calendar: ISO, calendarDisplay: {} },
    });
    seedNotelet(harness, "week/standup.md", "2026-06-01");

    await harness.resolve(WeekPresetService).apply(WESTERN);

    const frontmatter = frontmatterOf(harness, "week/standup.md") ?? {};
    expect(frontmatter).toMatchObject({ "journal-date": "2026-05-31", "journal-notelet": "Standup" });
    expect(frontmatter).not.toHaveProperty("journal-end-date");
  });

  // A week grid can also arrive from Obsidian Sync, which never passes through apply(): reload()
  // refreshes the calendar slice along with every other one. Without a re-anchor there, the note
  // keeps a stored date that is no longer its week's first day, so the calendar reads "no note"
  // over a file that is sitting right there.
  describe("week grid arriving from an external settings reload", () => {
    describe("starting on the ISO grid", () => {
      let harness: TestHarness;
      const journals = weekly();

      beforeEach(async () => {
        harness = await testContainer({ modules: MODULES, data: { journals, calendar: ISO, calendarDisplay: {} } });
      });

      it("re-anchors a weekly note onto the synced grid", async () => {
        seedWeek(harness, "week/2026-W23.md", "2026-06-01");

        await syncCalendar(harness, WESTERN);

        await vi.waitFor(() => expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-date"]).toBe("2026-05-31"));
      });

      it("writes nothing when the reload does not move the grid", async () => {
        seedWeek(harness, "week/2026-W23.md", "2026-06-01");
        const spy = vi.spyOn(harness.resolve(NotesService), "updateFrontmatter");

        await syncCalendar(harness, ISO);

        expect(spy).not.toHaveBeenCalled();
      });
    });

    // The re-anchor has to preserve which WEEK the note was, not which week now contains its old
    // anchor. Going Western -> ISO the two answers differ by a full week for every anchor: the
    // Western anchor is a Sunday, which ISO counts as the LAST day of the preceding week. Resolving
    // by containment (anchorOf, as the v1 migration's canonicalization does) would silently shift a
    // user's whole weekly archive back one week.
    it("keeps the note's week identity rather than re-reading its old anchor under the new grid", async () => {
      const journals = weekly();
      const harness = await testContainer({
        modules: MODULES,
        data: { journals, calendar: WESTERN, calendarDisplay: {} },
      });
      seedWeek(harness, "week/2025-W45.md", "2025-11-02");

      await syncCalendar(harness, ISO);

      // 2025-10-27 is the containment answer — the ISO week holding the old Sunday anchor.
      await vi.waitFor(() => expect(frontmatterOf(harness, "week/2025-W45.md")?.["journal-date"]).toBe("2025-11-03"));
    });

    it("recomputes the end date against the synced grid", async () => {
      const journals = weekly({ addEndDate: true });
      const harness = await testContainer({ modules: MODULES, data: { journals, calendar: ISO, calendarDisplay: {} } });
      seedWeek(harness, "week/2026-W23.md", "2026-06-01");

      await syncCalendar(harness, WESTERN);

      await vi.waitFor(() =>
        expect(frontmatterOf(harness, "week/2026-W23.md")?.["journal-end-date"]).toBe("2026-06-06"),
      );
    });
  });
});
