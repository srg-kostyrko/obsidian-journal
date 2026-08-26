import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";

import { filterJournalNotes, findVaultNotesCreatedOn, localCreationAnchor } from "./use-vault-day-notes";

const day = (value: number): number => new Date(2026, 4, value, 10, 30).getTime();
const shelves = (membership: Readonly<Record<string, string>>) => ({
  shelfOf: (journalName: string): string => membership[journalName] ?? "",
});

describe("vault day notes", () => {
  it("matches filesystem creation day in local time, not modification day", () => {
    const notes = new FakeNotesService();
    notes.seed("created-on-25.md" as VaultPath, "", {}, { ctime: day(25), mtime: day(26) });
    notes.seed("created-on-26.md" as VaultPath, "", {}, { ctime: day(26), mtime: day(25) });

    expect(findVaultNotesCreatedOn(notes, "2026-05-25" as AnchorString, "modified-desc").map((n) => n.path)).toEqual([
      "created-on-25.md",
    ]);
  });

  it("formats a creation timestamp as a local calendar anchor", () => {
    expect(localCreationAnchor(new Date(2026, 0, 2, 0, 15).getTime())).toBe("2026-01-02");
  });

  it("sorts by modification time in either direction", () => {
    const notes = new FakeNotesService();
    notes.seed("older.md" as VaultPath, "", {}, { ctime: day(25), mtime: 10 });
    notes.seed("newer.md" as VaultPath, "", {}, { ctime: day(25), mtime: 20 });

    expect(
      findVaultNotesCreatedOn(notes, "2026-05-25" as AnchorString, "modified-desc").map((n) => n.basename),
    ).toEqual(["newer", "older"]);
    expect(findVaultNotesCreatedOn(notes, "2026-05-25" as AnchorString, "modified-asc").map((n) => n.basename)).toEqual(
      ["older", "newer"],
    );
  });

  it("sorts names naturally in either direction", () => {
    const notes = new FakeNotesService();
    notes.seed("Note 10.md" as VaultPath, "", {}, { ctime: day(25) });
    notes.seed("Note 2.md" as VaultPath, "", {}, { ctime: day(25) });

    expect(findVaultNotesCreatedOn(notes, "2026-05-25" as AnchorString, "name-asc").map((n) => n.basename)).toEqual([
      "Note 2",
      "Note 10",
    ]);
    expect(findVaultNotesCreatedOn(notes, "2026-05-25" as AnchorString, "name-desc").map((n) => n.basename)).toEqual([
      "Note 10",
      "Note 2",
    ]);
  });

  it("optionally excludes notes recognized by the configured journals index", () => {
    const notes = new FakeNotesService();
    const journals = new JournalsIndex();
    const journalPath = "Daily/2026-05-25.md" as VaultPath;
    const regularPath = "Notes/idea.md" as VaultPath;
    notes.seed(journalPath, "", {}, { ctime: day(25) });
    notes.seed(regularPath, "", {}, { ctime: day(25) });
    journals.register({ journalName: "daily", anchor: "2026-05-25" as AnchorString, path: journalPath });
    const found = findVaultNotesCreatedOn(notes, "2026-05-25" as AnchorString, "modified-desc");

    expect(filterJournalNotes(found, journals, shelves({ daily: "Work" }), true, null)).toEqual([
      expect.objectContaining({ path: journalPath, journalName: "daily", shelfName: "Work" }),
      expect.objectContaining({ path: regularPath }),
    ]);
    expect(
      filterJournalNotes(found, journals, shelves({ daily: "Work" }), false, null).map((note) => note.path),
    ).toEqual([regularPath]);
  });

  it("applies the selected shelf only to journal notes", () => {
    const notes = new FakeNotesService();
    const journals = new JournalsIndex();
    const workPath = "Daily/work.md" as VaultPath;
    const regularPath = "Notes/idea.md" as VaultPath;
    const personalPath = "Personal/personal.md" as VaultPath;
    notes.seed(workPath, "", {}, { ctime: day(25) });
    notes.seed(regularPath, "", {}, { ctime: day(25) });
    notes.seed(personalPath, "", {}, { ctime: day(25) });
    journals.register({ journalName: "work-daily", anchor: "2026-05-25" as AnchorString, path: workPath });
    journals.register({ journalName: "personal-daily", anchor: "2026-05-25" as AnchorString, path: personalPath });
    const found = findVaultNotesCreatedOn(notes, "2026-05-25" as AnchorString, "modified-desc");

    const visible = filterJournalNotes(
      found,
      journals,
      shelves({ "work-daily": "Work", "personal-daily": "Personal" }),
      true,
      "Work",
    );

    expect(visible).toEqual([
      expect.objectContaining({ path: workPath, journalName: "work-daily", shelfName: "Work" }),
      expect.objectContaining({ path: regularPath }),
    ]);
    expect(visible[1]).not.toHaveProperty("journalName");
    expect(visible[1]).not.toHaveProperty("shelfName");
  });
});
