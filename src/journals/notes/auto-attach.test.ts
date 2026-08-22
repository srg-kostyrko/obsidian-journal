import { beforeEach, describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { NoteMetadata, VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { customJournal, fixedJournal } from "../testing";

import { AutoAttachService } from "./auto-attach";
import { NoteCreationService } from "./note-creation";

const TIMELINE_OPEN = { start: anchor("2020-01-01"), end: { kind: "never" as const } };

// The real NoteMetadataService reads getFileCache, which the fake vault fills the instant a file
// lands — so a created-but-unparsed note would be indistinguishable from a parsed one and the three
// tests below that pin the wait would pass with the wait deleted. The fake models the two moments
// as separate, which is the whole subject of this suite.
function stagedMetadata(): FakeNoteMetadataService {
  return new FakeNoteMetadataService();
}

describe("AutoAttachService", () => {
  describe("a daily journal covering the whole timeline", () => {
    let harness: TestHarness;
    let metadata: FakeNoteMetadataService;

    beforeEach(async () => {
      metadata = stagedMetadata();
      harness = await testContainer({
        modules: [journalsCoreModule],
        overrides: [overrideWith(NoteMetadataService, metadata as unknown as NoteMetadataService)],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { timeline: TIMELINE_OPEN }) } },
      });
    });

    it("attaches a newly-created note matching exactly one journal", async () => {
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      harness.host.emitMetadata("2026-05-19.md");
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });

    it("skips paths the plugin just created via ensureNote", async () => {
      await harness.resolve(AutoAttachService).initialize();

      await harness
        .resolve(NoteCreationService)
        .ensureNote("daily", { journalName: "daily", anchor: anchor("2026-05-19") });
      // The note ensureNote wrote parses like any other, so the suppression guard is the only
      // thing between this and a second, redundant attach.
      metadata.setMetadata("2026-05-19.md" as VaultPath, { properties: {} } as unknown as NoteMetadata);
      harness.host.emitMetadata("2026-05-19.md");
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.logs.records.some((record) => record.message === "auto-attach succeeded")).toBe(false);
    });

    it("does nothing when the path is already indexed", async () => {
      harness.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: anchor("2026-05-19"),
        path: "2026-05-19.md" as VaultPath,
      });
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      harness.host.emitMetadata("2026-05-19.md");
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
    });

    it("attaches a note that is renamed into a matching path", async () => {
      harness.host.putFile("Inbox/draft.md", "");
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).rename("Inbox/draft.md" as VaultPath, "2026-05-19.md" as VaultPath);
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });

    it("leaves a note claiming a journal this version doesn't know", async () => {
      metadata.setMetadata(
        "2026-05-19.md" as VaultPath,
        {
          properties: { journal: "legacy-id", "journal-section": "day" },
        } as unknown as NoteMetadata,
      );
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      harness.host.emitMetadata("2026-05-19.md");
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
    });

    it("ignores the notes Obsidian replays while the vault is still loading", async () => {
      harness.host.workspace.layoutReady = false;
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      harness.host.emitMetadata("2026-05-19.md");
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
    });

    // A rename re-keys metadataCache without re-parsing, so no metadata-changed follows it. A
    // renamed path held back to wait for one would never be adopted at all.
    it("attaches a renamed note without waiting for a metadata-changed that never comes", async () => {
      await harness.resolve(AutoAttachService).initialize();

      // Created at a non-matching path and renamed into a matching one before anything parsed it,
      // so the create is still parked and the rename is the only signal that will ever arrive.
      const notes = harness.resolve(NotesService);
      await notes.create("Inbox/draft.md" as VaultPath, "");
      await notes.rename("Inbox/draft.md" as VaultPath, "2026-05-19.md" as VaultPath);
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });

    it("waits for a created note to be parsed before deciding anything about it", async () => {
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      await new Promise((r) => window.setTimeout(r, 0));
      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});

      metadata.setMetadata("2026-05-19.md" as VaultPath, { properties: {} } as unknown as NoteMetadata);
      harness.host.emitMetadata("2026-05-19.md");
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });

    it("attaches a note created once the vault has finished loading", async () => {
      harness.host.workspace.layoutReady = false;
      await harness.resolve(AutoAttachService).initialize();

      harness.host.setLayoutReady();
      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      harness.host.emitMetadata("2026-05-19.md");
      await new Promise((r) => window.setTimeout(r, 0));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });
  });

  it("does nothing for a path that doesn't match any journal", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      overrides: [overrideWith(NoteMetadataService, stagedMetadata() as unknown as NoteMetadataService)],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Diary", timeline: TIMELINE_OPEN }) },
      },
    });
    await harness.resolve(AutoAttachService).initialize();

    await harness.resolve(NotesService).create("Inbox/random.md" as VaultPath, "");
    harness.host.emitMetadata("Inbox/random.md");
    await new Promise((r) => window.setTimeout(r, 0));

    expect(
      harness
        .resolve(JournalsIndex)
        .entryByPath("Inbox/random.md" as VaultPath)
        .isNone(),
    ).toBe(true);
  });

  it("does nothing when the path matches multiple journals", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      overrides: [overrideWith(NoteMetadataService, stagedMetadata() as unknown as NoteMetadataService)],
      data: {
        journals: {
          a: fixedJournal("a", { type: "day" }, { timeline: TIMELINE_OPEN }),
          b: fixedJournal("b", { type: "day" }, { timeline: TIMELINE_OPEN }),
        },
      },
    });
    await harness.resolve(AutoAttachService).initialize();

    await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
    harness.host.emitMetadata("2026-05-19.md");
    await new Promise((r) => window.setTimeout(r, 0));

    expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
  });

  it("filters candidates by timeline.contains", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      overrides: [overrideWith(NoteMetadataService, stagedMetadata() as unknown as NoteMetadataService)],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { timeline: { start: anchor("2026-06-01"), end: { kind: "never" } } },
          ),
        },
      },
    });
    await harness.resolve(AutoAttachService).initialize();

    await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
    harness.host.emitMetadata("2026-05-19.md");
    await new Promise((r) => window.setTimeout(r, 0));

    expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
  });

  it("leaves a synced custom-interval note alone once parsing registers it", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      overrides: [overrideWith(NoteMetadataService, stagedMetadata() as unknown as NoteMetadataService)],
      data: { journals: { sprint: customJournal("sprint", "week", 2, "2026-08-03", { nameTemplate: "{{date}}" }) } },
    });
    await harness.resolve(AutoAttachService).initialize();

    // Sync writes the note; Obsidian has not parsed it, so nothing knows its manual end date yet.
    await harness.resolve(NotesService).create("2026-08-03.md" as VaultPath, "");
    // Parsing registers it through VaultSubscriptionService, which subscribes ahead of auto-attach.
    harness.resolve(JournalsIndex).register({
      journalName: "sprint",
      anchor: anchor("2026-08-03"),
      path: "2026-08-03.md" as VaultPath,
      endDate: anchor("2026-08-23"),
    });
    harness.host.emitMetadata("2026-08-03.md");
    await new Promise((r) => window.setTimeout(r, 0));

    expect(harness.host.files.get("2026-08-03.md")?.frontmatter).toEqual({});
  });
});
