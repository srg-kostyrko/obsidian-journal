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
import { SelfWriteGuard } from "./self-write-guard";

import type { JournalConfig } from "../config";
import type { Prompt, PromptAnswer } from "../prompts/config";

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

async function answerPrompt(harness: TestHarness, answers: Record<string, PromptAnswer>): Promise<void> {
  await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
  harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit(answers);
  await settle();
}

describe("AutoAttachService — a note Obsidian created from a link carrying the placeholder", () => {
  const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

  async function promptingHarness(overrides: Partial<JournalConfig> = {}): Promise<TestHarness> {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { nameTemplate: "{{date}} {{mood}}", prompts: [mood], timeline: TIMELINE_OPEN, ...overrides },
          ),
        },
      },
    });
    await harness.resolve(AutoAttachService).initialize();
    return harness;
  }

  it("prompts, renames and attaches a file whose name carries the placeholder", async () => {
    const harness = await promptingHarness();

    void harness.resolve(NotesService).create("2026-05-19 (unanswered).md" as VaultPath, "");
    await answerPrompt(harness, { mood: "good" });

    expect(harness.host.files.has("2026-05-19 (unanswered).md")).toBe(false);
    expect(harness.host.files.get("2026-05-19 good.md")?.frontmatter).toMatchObject({
      journal: "daily",
      "journal-date": "2026-05-19",
      mood: "good",
    });
  });

  it("does not prompt for a pre-existing file adopted by pattern", async () => {
    const harness = await promptingHarness({
      prompts: [{ ...mood, type: "select", options: [{ label: "Good", value: "good" }] }],
    });

    await harness.resolve(NotesService).create("2026-05-19 good.md" as VaultPath, "");
    await settle();

    expect(harness.modals.opens).toHaveLength(0);
    expect(harness.host.files.get("2026-05-19 good.md")?.frontmatter).toMatchObject({
      journal: "daily",
      "journal-date": "2026-05-19",
    });
  });

  it("does not attach when the prompt is cancelled, leaving the file unclaimed", async () => {
    const harness = await promptingHarness();

    void harness.resolve(NotesService).create("2026-05-19 (unanswered).md" as VaultPath, "");
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen().cancel();
    await settle();

    expect(harness.host.files.get("2026-05-19 (unanswered).md")?.frontmatter).toEqual({});
    expect(harness.host.files.has("2026-05-19 .md")).toBe(false);
  });

  it("suppresses its own rename so the renamed handler does not re-enter", async () => {
    const harness = await promptingHarness();
    const guard = harness.resolve(SelfWriteGuard);
    const notes = harness.resolve(NotesService);
    const rename = notes.rename.bind(notes);
    let suppressedWhenRenaming: boolean | undefined;
    vi.spyOn(notes, "rename").mockImplementation((from, to) => {
      suppressedWhenRenaming = guard.suppresses(to);
      return rename(from, to);
    });

    void notes.create("2026-05-19 (unanswered).md" as VaultPath, "");
    await answerPrompt(harness, { mood: "good" });

    expect(suppressedWhenRenaming).toBe(true);
    expect(harness.modals.opens).toHaveLength(1);
  });

  it("renders the template with the answers, not with the placeholder", async () => {
    const harness = await promptingHarness({ templates: ["Templates/daily.md"] });
    harness.host.putFile("Templates/daily.md", "mood: {{mood}}");

    void harness.resolve(NotesService).create("2026-05-19 (unanswered).md" as VaultPath, "");
    await answerPrompt(harness, { mood: "good" });

    expect(harness.host.files.get("2026-05-19 good.md")?.content).toBe("mood: good");
  });

  it("removes the source directory when it carried the placeholder and is now empty", async () => {
    const harness = await promptingHarness({ nameTemplate: "{{date}}", folder: "{{mood}}" });

    void harness.resolve(NotesService).create("(unanswered)/2026-05-19.md" as VaultPath, "");
    await answerPrompt(harness, { mood: "good" });

    expect(harness.host.files.has("good/2026-05-19.md")).toBe(true);
    expect(harness.host.folders.has("(unanswered)")).toBe(false);
  });

  it("leaves a source directory that still holds other files", async () => {
    const harness = await promptingHarness({ nameTemplate: "{{date}}", folder: "{{mood}}" });
    harness.host.putFile("(unanswered)/keep.md", "");

    void harness.resolve(NotesService).create("(unanswered)/2026-05-19.md" as VaultPath, "");
    await answerPrompt(harness, { mood: "good" });

    expect(harness.host.files.has("good/2026-05-19.md")).toBe(true);
    expect(harness.host.folders.has("(unanswered)")).toBe(true);
    expect(harness.host.files.has("(unanswered)/keep.md")).toBe(true);
  });

  it("leaves a source directory holding nothing but a subfolder", async () => {
    const harness = await promptingHarness({ nameTemplate: "{{date}}", folder: "{{mood}}" });
    harness.host.putFolder("(unanswered)/nested");

    void harness.resolve(NotesService).create("(unanswered)/2026-05-19.md" as VaultPath, "");
    await answerPrompt(harness, { mood: "good" });

    expect(harness.host.files.has("good/2026-05-19.md")).toBe(true);
    expect(harness.host.folders.has("(unanswered)/nested")).toBe(true);
  });

  it("leaves a source directory whose own name carries no placeholder", async () => {
    const harness = await promptingHarness({ folder: "Diary" });
    const deleteFolder = vi.spyOn(harness.resolve(NotesService), "deleteFolder");

    void harness.resolve(NotesService).create("Diary/2026-05-19 (unanswered).md" as VaultPath, "");
    await answerPrompt(harness, { mood: "good" });

    expect(harness.host.files.has("Diary/2026-05-19 good.md")).toBe(true);
    expect(deleteFolder).not.toHaveBeenCalled();
    expect(harness.host.folders.has("Diary")).toBe(true);
  });
});
