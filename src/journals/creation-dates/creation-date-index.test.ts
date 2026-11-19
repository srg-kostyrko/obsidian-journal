import { TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { NoteMetadataService, type VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { SettingsEventsToken } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { CreationDateIndex } from "./creation-date-index";
import { dayNotesSlice } from "./slice";

const PLAIN = "Notes/plain.md";
const NOTELET = "Journal/Daily/2026-10-05 Meeting.md";
const PERIOD = "Journal/Daily/2026-10-05.md";

const settle = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

const day = (value: string): CalendarDate => CalendarDate.fromAnchor(value as AnchorString);

const daily = fixedJournal("Daily", { type: "day" }, { folder: "Journal/Daily", nameTemplate: "{{date:YYYY-MM-DD}}" });

function timestamp(year: number, month: number, date: number): number {
  return new Date(year, month - 1, date, 10, 30).getTime();
}

describe("CreationDateIndex", () => {
  let harness: TestHarness;
  let dates: CreationDateIndex;

  const count = (value: string, excludePeriodNotes = false): number =>
    dates.countBetween(day(value), day(value), { excludePeriodNotes });

  function seed(): void {
    harness.host.putFile(PLAIN, "", { created: "2026-10-05" });
    harness.host.putFile(NOTELET, "", { created: "2026-10-05" });
    harness.host.putFile(PERIOD, "", { created: "2026-10-05" });
    const index = harness.resolve(JournalsIndex);
    index.register({
      kind: "notelet",
      journalName: "Daily",
      anchor: anchor("2026-10-05"),
      path: NOTELET as VaultPath,
      typeName: "Meeting",
      typeId: null,
    });
    index.register({ journalName: "Daily", anchor: anchor("2026-10-05"), path: PERIOD as VaultPath });
  }

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { Daily: daily } } });
    dates = harness.resolve(CreationDateIndex);
    seed();
  });

  it("answers nothing until the journals index is ready, then announces itself once", async () => {
    const changed = vi.fn();
    dates.events.on("changed", changed);
    const started = dates.initialize();
    await settle();

    expect(dates.isReady()).toBe(false);
    expect(count("2026-10-05")).toBe(0);

    harness.resolve(JournalsIndex).markReady();
    await started;
    await settle();

    expect(dates.isReady()).toBe(true);
    expect(count("2026-10-05")).toBe(3);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  describe("once ready", () => {
    beforeEach(async () => {
      harness.resolve(JournalsIndex).markReady();
      await dates.initialize();
      await settle();
    });

    it("counts notelets but not period notes when period notes are excluded", () => {
      expect(count("2026-10-05", true)).toBe(2);
      expect(count("2026-10-05", false)).toBe(3);
    });

    it("lists every note created in a range with its creation date", () => {
      const listed = dates.between(day("2026-10-05").startOf("week"), day("2026-10-05").endOf("week"));

      expect(listed.map((entry) => entry.note.path).toSorted()).toEqual([NOTELET, PERIOD, PLAIN].toSorted());
      expect(listed.every((entry) => entry.created.toAnchor() === "2026-10-05")).toBe(true);
    });

    it("re-dates a note whose creation property is edited", async () => {
      harness.host.emitMetadata(PLAIN, { frontmatter: { created: "2026-10-07" } });
      await settle();

      expect(count("2026-10-05", true)).toBe(1);
      expect(count("2026-10-07", true)).toBe(1);
    });

    it("drops a deleted note from its day", async () => {
      const file = harness.host.putFile("Notes/lonely.md", "", { created: "2026-10-09" });
      harness.host.emitVault("create", file);
      await settle();
      expect(count("2026-10-09")).toBe(1);

      await harness.host.app.vault.delete(file);
      await settle();

      expect(count("2026-10-09")).toBe(0);
    });

    it("keeps a renamed note's date under its new path", async () => {
      const file = harness.host.app.vault.getAbstractFileByPath(PLAIN);
      if (!(file instanceof TFile)) throw new TypeError("seeded note missing");
      await harness.host.app.vault.rename(file, "Notes/renamed.md");
      await settle();

      const paths = dates.between(day("2026-10-05"), day("2026-10-05")).map((entry) => entry.note.path);
      expect(paths).toContain("Notes/renamed.md");
      expect(paths).not.toContain(PLAIN);
      expect(count("2026-10-05")).toBe(3);
    });

    it("re-dates every note when the creation property changes", async () => {
      harness.host.emitMetadata(PLAIN, { frontmatter: { created: "2026-10-05", born: "2026-10-20" } });
      await settle();
      const changed = vi.fn();
      dates.events.on("changed", changed);

      harness.settings.getSlice(dayNotesSlice).state = { property: "born", format: "YYYY-MM-DD" };
      await settle();

      expect(count("2026-10-20")).toBe(1);
      expect(changed).toHaveBeenCalled();
    });

    it("re-dates every note when a settings reload replaces the slice", async () => {
      // Staged without an event: only the rebuild the slice change triggers can see it.
      harness.host.files.set(PLAIN, {
        content: "",
        frontmatter: { born: "2026-10-21" },
        metadata: { frontmatter: { born: "2026-10-21" } },
      });

      // A reload assigns a freshly parsed slice object, as SettingsService.#refresh does.
      harness.settings.getSlice(dayNotesSlice).state = { property: "born", format: "YYYY-MM-DD" };
      harness.resolve(SettingsEventsToken).emit("reloaded");
      await settle();

      expect(count("2026-10-21")).toBe(1);
    });

    it("excludes a note from the period-note-free count once it becomes a period note, and announces it", async () => {
      const file = harness.host.putFile("Notes/later.md", "", { created: "2026-10-12" });
      harness.host.emitVault("create", file);
      await settle();
      expect(count("2026-10-12", true)).toBe(1);
      const changed = vi.fn();
      dates.events.on("changed", changed);

      harness.resolve(JournalsIndex).register({
        journalName: "Daily",
        anchor: anchor("2026-10-12"),
        path: "Notes/later.md" as VaultPath,
      });

      expect(count("2026-10-12", true)).toBe(0);
      expect(count("2026-10-12", false)).toBe(1);
      await settle();
      // The connected period's cells repaint on their own; the creation day's cell needs this.
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it("keeps a renamed note's property date even when the new path's metadata is not parsed yet", async () => {
      const file = harness.host.app.vault.getAbstractFileByPath(PLAIN);
      if (!(file instanceof TFile)) throw new TypeError("seeded note missing");
      file.stat.ctime = timestamp(2026, 10, 1);
      vi.spyOn(harness.resolve(NoteMetadataService), "get").mockReturnValue(Option.none());

      await harness.host.app.vault.rename(file, "Notes/renamed.md");
      await settle();

      expect(count("2026-10-05")).toBe(3);
      expect(count("2026-10-01")).toBe(0);
    });

    it("ignores an attachment created in the vault", async () => {
      const picture = harness.host.putFile("Notes/pic.png");
      picture.stat.ctime = timestamp(2026, 10, 5);
      harness.host.emitVault("create", picture);
      await settle();

      expect(count("2026-10-05")).toBe(3);
    });

    it("drops a note renamed to a non-markdown file", async () => {
      const file = harness.host.app.vault.getAbstractFileByPath(PLAIN);
      if (!(file instanceof TFile)) throw new TypeError("seeded note missing");
      file.stat.ctime = timestamp(2026, 10, 5);
      await harness.host.app.vault.rename(file, "Notes/plain.png");
      await settle();

      expect(count("2026-10-05")).toBe(2);
    });

    it("coalesces many changes in one tick into one announcement", async () => {
      const changed = vi.fn();
      dates.events.on("changed", changed);

      harness.host.emitMetadata(PLAIN, { frontmatter: { created: "2026-10-07" } });
      harness.host.emitMetadata(NOTELET, { frontmatter: { created: "2026-10-08" } });
      await settle();

      expect(changed).toHaveBeenCalledTimes(1);
    });

    it("stops following the vault once disposed", async () => {
      dates[Symbol.dispose]();
      harness.host.emitMetadata(PLAIN, { frontmatter: { created: "2026-10-07" } });
      await settle();

      expect(count("2026-10-07")).toBe(0);
    });

    it("stops re-dating on a slice change once disposed", async () => {
      harness.host.emitMetadata(PLAIN, { frontmatter: { created: "2026-10-05", born: "2026-10-20" } });
      await settle();
      dates[Symbol.dispose]();

      harness.settings.getSlice(dayNotesSlice).state = { property: "born", format: "YYYY-MM-DD" };
      await settle();

      expect(count("2026-10-20")).toBe(0);
    });
  });

  it("does not date a note by its file time while its metadata is still unresolved at boot", async () => {
    const cold = harness.host.putFile("Notes/cold.md", "", { created: "2026-10-05" });
    cold.stat.ctime = timestamp(2026, 1, 1);
    const getFileCache = vi.spyOn(harness.host.app.metadataCache, "getFileCache").mockReturnValue(null);
    const started = dates.initialize();
    harness.host.emitVault("create", cold);
    await settle();

    expect(count("2026-01-01")).toBe(0);

    getFileCache.mockRestore();
    harness.resolve(JournalsIndex).markReady();
    await started;

    expect(count("2026-01-01")).toBe(0);
    expect(count("2026-10-05")).toBe(4);
  });
});
