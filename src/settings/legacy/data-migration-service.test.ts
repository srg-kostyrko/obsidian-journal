import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { DataMigrationService } from "./data-migration-service";
import { legacyMigrationsModule } from "./module";
import { pendingNoteMigrationSlice, type PendingNoteMigration } from "./pending-note-migration";

const settle = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

// Layout ready fires, THEN metadata resolves — the same order a cold Obsidian boot uses, and the
// order CLAUDE.md's boot-and-lifecycle trap calls out: a walk that reacts to the layout signal
// alone (without also waiting for metadata) fires while every note's metadata is still absent,
// skips every note, and clears the markers anyway. Flipping layoutReady false/true before handing
// any metadata to the fake is what makes that distinction observable — a correct implementation
// waits for the metadata.emitResolved() below; one that does not runs too early and skips notes.
async function migrate(
  harness: TestHarness,
  metadata: FakeNoteMetadataService,
  notes: Record<string, Record<string, unknown>>,
): Promise<void> {
  harness.host.workspace.layoutReady = false;
  await harness.resolve(DataMigrationService).initialize();
  harness.host.setLayoutReady();
  for (const [path, properties] of Object.entries(notes)) {
    metadata.setMetadata(path as VaultPath, { title: path.replace(/\.md$/, ""), tags: [], properties, tasks: [] });
  }
  metadata.emitResolved();
  await settle();
}

describe("DataMigrationService", () => {
  it("renames a calendar note to the resolved journal and writes the date field", async () => {
    const marker: PendingNoteMigration = {
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { month: "My Journal Month" },
    };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: {
        journals: { "My Journal Month": fixedJournal("My Journal Month", { type: "month" }) },
        pendingNoteMigration: [marker],
      },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    const properties = {
      journal: "cal",
      "journal-start-date": "2022-01-01",
      "journal-end-date": "2022-01-31",
      "journal-section": "month",
    };
    harness.host.putFile("note.md", "", properties);

    await migrate(harness, metadata, { "note.md": properties });

    expect(harness.host.files.get("note.md")?.frontmatter).toEqual({
      journal: "My Journal Month",
      "journal-date": "2022-01-01",
    });
  });

  it("writes the canonical anchor, not the raw start date, into the date field", async () => {
    const marker: PendingNoteMigration = {
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { week: "Weekly" },
    };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: {
        journals: { Weekly: fixedJournal("Weekly", { type: "week" }) },
        pendingNoteMigration: [marker],
      },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    // 2022-01-05 is a Wednesday; the default Monday-start grid's canonical week anchor for it
    // is 2022-01-03, which is what proves the write goes through the cycle rather than the raw date.
    const properties = { journal: "cal", "journal-start-date": "2022-01-05", "journal-section": "week" };
    harness.host.putFile("wk.md", "", properties);

    await migrate(harness, metadata, { "wk.md": properties });

    expect(harness.host.files.get("wk.md")?.frontmatter).toEqual({ journal: "Weekly", "journal-date": "2022-01-03" });
  });

  it("moves the interval index into the journal's configured index field", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: {
        journals: {
          Sprints: customJournal("Sprints", "week", 2, "2022-02-01", {
            numbering: {
              enabled: true,
              anchorDate: "2022-02-01" as AnchorString,
              allowBefore: false,
              sources: [
                { variable: "index", frontmatterKey: "sprint-number", anchorValue: 1, reset: { kind: "never" } },
              ],
            },
          }),
        },
        pendingNoteMigration: [marker],
      },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    const properties = { journal: "int", "journal-start-date": "2022-02-01", "journal-interval-index": 1 };
    harness.host.putFile("sprint.md", "", properties);

    await migrate(harness, metadata, { "sprint.md": properties });

    const result = harness.host.files.get("sprint.md")?.frontmatter;
    expect(result?.["sprint-number"]).toBe(1);
    expect(result).not.toHaveProperty("journal-interval-index");
    expect(result).not.toHaveProperty("journal-index");
  });

  it("re-canonicalizes a week-anchor journal's note date to the week anchor", async () => {
    const marker: PendingNoteMigration = { kind: "week-anchor", journalName: "Weekly" };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: {
        journals: { Weekly: fixedJournal("Weekly", { type: "week" }) },
        pendingNoteMigration: [marker],
      },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    const properties = { journal: "Weekly", "journal-date": "2022-01-05" };
    harness.host.putFile("wk.md", "", properties);

    await migrate(harness, metadata, { "wk.md": properties });

    expect(harness.host.files.get("wk.md")?.frontmatter).toEqual({ journal: "Weekly", "journal-date": "2022-01-03" });
  });

  it("leaves an already-canonical week-anchor note untouched", async () => {
    const marker: PendingNoteMigration = { kind: "week-anchor", journalName: "Weekly" };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: {
        journals: { Weekly: fixedJournal("Weekly", { type: "week" }) },
        pendingNoteMigration: [marker],
      },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    const properties = { journal: "Weekly", "journal-date": "2022-01-03" };
    harness.host.putFile("wk.md", "", properties);
    const updateFrontmatter = vi.spyOn(harness.resolve(NotesService), "updateFrontmatter");

    await migrate(harness, metadata, { "wk.md": properties });

    expect(updateFrontmatter).not.toHaveBeenCalled();
  });

  it("ignores notes that do not belong to a week-anchor journal", async () => {
    const marker: PendingNoteMigration = { kind: "week-anchor", journalName: "Weekly" };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: {
        journals: { Weekly: fixedJournal("Weekly", { type: "week" }), Daily: fixedJournal("Daily", { type: "day" }) },
        pendingNoteMigration: [marker],
      },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    const properties = { journal: "Daily", "journal-date": "2022-01-03" };
    harness.host.putFile("other.md", "", properties);
    const updateFrontmatter = vi.spyOn(harness.resolve(NotesService), "updateFrontmatter");

    await migrate(harness, metadata, { "other.md": properties });

    expect(updateFrontmatter).not.toHaveBeenCalled();
    expect(harness.host.files.get("other.md")?.frontmatter).toEqual({ journal: "Daily", "journal-date": "2022-01-03" });
  });

  it("strips all journal keys when the anchor cannot be resolved", async () => {
    const marker: PendingNoteMigration = {
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { month: "My Journal Month" },
    };
    // "My Journal Month" is deliberately not registered, so the config lookup fails and the
    // anchor can never resolve.
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: { pendingNoteMigration: [marker] },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    const properties = {
      journal: "cal",
      "journal-start-date": "2022-01-01",
      "journal-end-date": "2022-01-31",
      "journal-section": "month",
      "journal-date": "2022-01-01",
      title: "kept",
    };
    harness.host.putFile("orphan.md", "", properties);

    await migrate(harness, metadata, { "orphan.md": properties });

    expect(harness.host.files.get("orphan.md")?.frontmatter).toEqual({ title: "kept" });
  });

  it("clears the marker slice after running", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: { pendingNoteMigration: [marker] },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });

    await migrate(harness, metadata, {});

    expect(harness.settings.getSlice(pendingNoteMigrationSlice).state).toEqual([]);
  });

  it("does not touch any note when there are no markers", async () => {
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: { pendingNoteMigration: [] },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    const properties = { journal: "cal" };
    harness.host.putFile("note.md", "", properties);
    const updateFrontmatter = vi.spyOn(harness.resolve(NotesService), "updateFrontmatter");

    await migrate(harness, metadata, { "note.md": properties });

    expect(updateFrontmatter).not.toHaveBeenCalled();
  });

  const calendarMarker: PendingNoteMigration = {
    oldJournalId: "cal",
    kind: "calendar",
    sectionToName: { month: "My Journal Month" },
  };

  // These three tests prove the deferral itself, so they drive layoutReady/metadata by hand
  // rather than through the shared migrate() helper above.
  async function deferralHarness(): Promise<{ harness: TestHarness; metadata: FakeNoteMetadataService }> {
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: {
        journals: { "My Journal Month": fixedJournal("My Journal Month", { type: "month" }) },
        pendingNoteMigration: [calendarMarker],
      },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    harness.host.putFile("note.md", "", {
      journal: "cal",
      "journal-start-date": "2022-01-01",
      "journal-section": "month",
    });
    return { harness, metadata };
  }

  it("does not walk before the layout is ready", async () => {
    const { harness } = await deferralHarness();
    harness.host.workspace.layoutReady = false;

    await harness.resolve(DataMigrationService).initialize();

    expect(harness.settings.getSlice(pendingNoteMigrationSlice).state).toEqual([calendarMarker]);
  });

  it("defers the walk until every note has resolved in metadataCache", async () => {
    const { harness, metadata } = await deferralHarness();
    harness.host.workspace.layoutReady = false;

    await harness.resolve(DataMigrationService).initialize();
    harness.host.setLayoutReady();
    expect(harness.settings.getSlice(pendingNoteMigrationSlice).state).toEqual([calendarMarker]);

    metadata.setMetadata("note.md" as VaultPath, {
      title: "note",
      tags: [],
      properties: { journal: "cal", "journal-start-date": "2022-01-01", "journal-section": "month" },
      tasks: [],
    });
    metadata.emitResolved();
    await settle();

    expect(harness.settings.getSlice(pendingNoteMigrationSlice).state).toEqual([]);
  });

  it("runs once the layout and metadata are already ready", async () => {
    const marker: PendingNoteMigration = { oldJournalId: "int", kind: "interval", name: "Sprints" };
    const metadata = new FakeNoteMetadataService();
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      data: { pendingNoteMigration: [marker] },
      overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
    });
    harness.host.putFile("note.md", "", { journal: "other" });
    // Both signals — layout ready (the fake host's default) and metadata resolved — are already
    // true before initialize() runs, so the walk must fire without waiting for either to change.
    metadata.setMetadata("note.md" as VaultPath, {
      title: "note",
      tags: [],
      properties: { journal: "other" },
      tasks: [],
    });

    await harness.resolve(DataMigrationService).initialize();
    await settle();

    expect(harness.settings.getSlice(pendingNoteMigrationSlice).state).toEqual([]);
  });
});
