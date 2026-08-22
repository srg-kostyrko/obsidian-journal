import { beforeEach, describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { None } from "@/infrastructure/result";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { customJournal, fixedJournal } from "../testing";

import { AutoAttachService } from "./auto-attach";
import { NoteCreationService } from "./note-creation";

const TIMELINE_OPEN = { start: anchor("2020-01-01"), end: { kind: "never" as const } };

const settle = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

// The fake vault fills getFileCache the moment a file lands, so a note that exists but has not been
// parsed yet is indistinguishable from a parsed one. Only the three tests that turn on that gap
// withhold the metadata; every other test in this file reads the vault's own frontmatter.
function withholdUntilParsed(harness: TestHarness, path: VaultPath): () => void {
  const metadata = harness.resolve(NoteMetadataService);
  const parse = metadata.get.bind(metadata);
  const spy = vi.spyOn(metadata, "get").mockImplementation((asked) => (asked === path ? new None() : parse(asked)));
  return () => void spy.mockImplementation(parse);
}

describe("AutoAttachService", () => {
  describe("a daily journal covering the whole timeline", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { timeline: TIMELINE_OPEN }) } },
      });
    });

    it("attaches a newly-created note matching exactly one journal", async () => {
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      harness.host.emitMetadata("2026-05-19.md");
      await settle();

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });

    it("skips paths the plugin just created via ensureNote", async () => {
      // ensureNote writes exactly the frontmatter a redundant attach would write, so the vault
      // cannot tell one write from two. The suppression guard is only visible at the call.
      const attach = vi.spyOn(harness.resolve(NoteCreationService), "attachNote");
      await harness.resolve(AutoAttachService).initialize();

      await harness
        .resolve(NoteCreationService)
        .ensureNote("daily", { journalName: "daily", anchor: anchor("2026-05-19") });
      await settle();

      expect(attach).not.toHaveBeenCalled();
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
      await settle();

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
    });

    it("attaches a note that is renamed into a matching path", async () => {
      harness.host.putFile("Inbox/draft.md", "");
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).rename("Inbox/draft.md" as VaultPath, "2026-05-19.md" as VaultPath);
      await settle();

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });

    it("leaves a note claiming a journal this version doesn't know", async () => {
      await harness.resolve(AutoAttachService).initialize();

      // Sync lands a file that already carries its claim, so the claim is in the vault before
      // Obsidian announces the file.
      const file = harness.host.putFile("2026-05-19.md", "", { journal: "legacy-id", "journal-section": "day" });
      harness.host.emitVault("create", file);
      harness.host.emitMetadata("2026-05-19.md");
      await settle();

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "legacy-id",
        "journal-section": "day",
      });
    });

    it("ignores the notes Obsidian replays while the vault is still loading", async () => {
      harness.host.workspace.layoutReady = false;
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      harness.host.emitMetadata("2026-05-19.md");
      await settle();

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
    });

    // A rename re-keys metadataCache without re-parsing, so no metadata-changed follows it. A
    // renamed path held back to wait for one would never be adopted at all.
    it("attaches a renamed note without waiting for a metadata-changed that never comes", async () => {
      withholdUntilParsed(harness, "Inbox/draft.md" as VaultPath);
      withholdUntilParsed(harness, "2026-05-19.md" as VaultPath);
      await harness.resolve(AutoAttachService).initialize();

      // Created at a non-matching path and renamed into a matching one before anything parsed it,
      // so the create is still parked and the rename is the only signal that will ever arrive.
      const notes = harness.resolve(NotesService);
      await notes.create("Inbox/draft.md" as VaultPath, "");
      await notes.rename("Inbox/draft.md" as VaultPath, "2026-05-19.md" as VaultPath);
      await settle();

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });

    it("waits for a created note to be parsed before deciding anything about it", async () => {
      const parsed = withholdUntilParsed(harness, "2026-05-19.md" as VaultPath);
      await harness.resolve(AutoAttachService).initialize();

      await harness.resolve(NotesService).create("2026-05-19.md" as VaultPath, "");
      await settle();
      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});

      parsed();
      harness.host.emitMetadata("2026-05-19.md");
      await settle();

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
      await settle();

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-05-19",
      });
    });
  });

  it("does nothing for a path that doesn't match any journal", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Diary", timeline: TIMELINE_OPEN }) },
      },
    });
    await harness.resolve(AutoAttachService).initialize();

    await harness.resolve(NotesService).create("Inbox/random.md" as VaultPath, "");
    harness.host.emitMetadata("Inbox/random.md");
    await settle();

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
    await settle();

    expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
  });

  it("filters candidates by timeline.contains", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
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
    await settle();

    expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toEqual({});
  });

  it("leaves a synced custom-interval note alone once parsing registers it", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { sprint: customJournal("sprint", "week", 2, "2026-08-03", { nameTemplate: "{{date}}" }) } },
    });
    const parsed = withholdUntilParsed(harness, "2026-08-03.md" as VaultPath);
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
    parsed();
    harness.host.emitMetadata("2026-08-03.md");
    await settle();

    expect(harness.host.files.get("2026-08-03.md")?.frontmatter).toEqual({});
  });
});
