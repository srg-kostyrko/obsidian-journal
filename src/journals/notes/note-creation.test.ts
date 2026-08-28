import { beforeEach, describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { UserAborted } from "@/infrastructure/flows";
import { FrontmatterError, NoteCreateError, NoteReadError, NoteWriteError, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { PromptsUnansweredError } from "../prompts/errors";
import { fixedJournal } from "../testing";

import { AnchorOccupiedError, EmptyNoteNameError } from "./errors";
import { NoteCreationService } from "./note-creation";
import { SelfWriteGuard } from "./self-write-guard";

import type { JournalConfig } from "../config";
import type { Prompt, PromptAnswer } from "../prompts/config";
import type { JournalMetadata } from "../types";

const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

describe("NoteCreationService.ensureNote", () => {
  describe("a plain daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("creates the file and writes frontmatter when the path is missing", async () => {
      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(result.isOk()).toBe(true);
      expect(result.isOk() && result.value.created).toBe(true);
      expect(result.isOk() && result.value.path).toBe("2026-05-19.md");
      expect(harness.host.files.has("2026-05-19.md")).toBe(true);
    });

    it("skips create but still writes frontmatter when the file already exists", async () => {
      harness.host.putFile("2026-05-19.md", "existing");

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(result.isOk() && result.value.created).toBe(false);
    });

    it("reuses the indexed note's path when it differs from the config-derived path", async () => {
      harness.host.putFile("Archive/renamed note.md", "existing");
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/renamed note.md" as VaultPath });

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expectOk(result);
      expect(result.value.path).toBe("Archive/renamed note.md");
      expect(result.value.created).toBe(false);
    });

    it("does not create a second note at the derived path when the entry is indexed elsewhere", async () => {
      harness.host.putFile("Archive/renamed note.md", "existing");
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/renamed note.md" as VaultPath });

      await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(harness.host.files.has("2026-05-19.md")).toBe(false);
    });

    it("creates at the derived path when the indexed file no longer exists", async () => {
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/gone.md" as VaultPath });

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expectOk(result);
      expect(result.value.path).toBe("2026-05-19.md");
      expect(result.value.created).toBe(true);
    });
  });

  describe("a journal that confirms creation", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) } },
      });
    });

    it("opens confirm modal when confirmCreation is true and returns UserAborted on cancel", async () => {
      const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
      await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
      harness.modals.lastOpen<{ journalName: string; noteName: string }, boolean>().cancel();

      const result = await promise;

      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
      expect(harness.host.files.has("2026-05-19.md")).toBe(false);
    });

    it("creates the file when confirmCreation is true and the modal is submitted", async () => {
      const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
      // Ordering, not just the outcome: the modal is open and nothing is on disk yet, which is
      // what "confirm before creating" means. Asserting only the created flag afterwards would
      // pass just as well against a service that wrote the note and then asked.
      await vi.waitFor(() => {
        expect(harness.modals.opens).toHaveLength(1);
        expect(harness.host.files.has("2026-05-19.md")).toBe(false);
      });
      harness.modals.lastOpen<{ journalName: string; noteName: string }, boolean>().submit(true);

      const result = await promise;

      expect(result.isOk() && result.value.created).toBe(true);
    });

    it("does not open the confirm modal when skipConfirmation is set", async () => {
      await harness.resolve(NoteCreationService).ensureNote("daily", meta, { skipConfirmation: true });

      expect(harness.modals.opens).toHaveLength(0);
    });

    it("creates the note when skipConfirmation bypasses confirmCreation", async () => {
      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta, { skipConfirmation: true });

      expect(result.isOk() && result.value.created).toBe(true);
    });
  });

  describe("a journal whose name template resolves to an empty name", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) } },
      });
    });

    it("refuses to create a note when the name template resolves to an empty name", async () => {
      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
    });

    it("writes no file when the name template resolves to an empty name", async () => {
      await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(harness.host.files.has(".md")).toBe(false);
    });

    it("opens the existing connected note when the name template resolves to an empty name", async () => {
      harness.host.putFile("Archive/connected note.md", "existing");
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/connected note.md" as VaultPath });

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expectOk(result);
      expect(result.value.path).toBe("Archive/connected note.md");
      expect(result.value.created).toBe(false);
    });
  });
});

describe("NoteCreationService.attachNote", () => {
  describe("a journal with a template", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) } },
      });
    });

    it("writes frontmatter and content when the existing file is empty", async () => {
      harness.host.putFile("Templates/daily.md", "# Daily {{date}}");
      harness.host.putFile("2026-05-19.md", "");

      const result = await harness.resolve(NoteCreationService).attachNote("daily", "2026-05-19.md" as VaultPath, meta);

      expect(result.isOk()).toBe(true);
      expect(harness.host.files.get("2026-05-19.md")?.content).toBe("# Daily 2026-05-19");
    });

    it("writes frontmatter only when the existing file has content", async () => {
      harness.host.putFile("Templates/daily.md", "# Daily {{date}}");
      harness.host.putFile("2026-05-19.md", "user-typed content");

      const result = await harness.resolve(NoteCreationService).attachNote("daily", "2026-05-19.md" as VaultPath, meta);

      expect(result.isOk()).toBe(true);
      expect(harness.host.files.get("2026-05-19.md")?.content).toBe("user-typed content");
    });

    it("treats whitespace-only content as empty", async () => {
      harness.host.putFile("Templates/daily.md", "body");
      harness.host.putFile("2026-05-19.md", "   \n  \n");

      const result = await harness.resolve(NoteCreationService).attachNote("daily", "2026-05-19.md" as VaultPath, meta);

      expect(result.isOk()).toBe(true);
      expect(harness.host.files.get("2026-05-19.md")?.content).toBe("body");
    });

    it("applies the template to an empty note even though attaching frontmatter fills the file body", async () => {
      harness.host.putFile("Templates/daily.md", "# Daily {{date}}");
      harness.host.putFile("2026-05-19.md", "");
      // Obsidian's processFrontMatter embeds a `---` block into the file text, so a note
      // reads back non-empty once frontmatter is attached. Model that here so emptiness must
      // be decided against the note's original body, not its post-frontmatter contents.
      const notes = harness.resolve(NotesService);
      vi.spyOn(notes, "updateFrontmatter").mockImplementation((path) =>
        AsyncResult.fromPromise(
          (async () => {
            const current = await notes.read(path);
            const body = current.isOk() ? current.value : "";
            await notes.write(path, `---\njournal: daily\n---\n${body}`);
          })(),
          () => new FrontmatterError(path, new Error("unreachable")),
        ),
      );

      const result = await harness.resolve(NoteCreationService).attachNote("daily", "2026-05-19.md" as VaultPath, meta);

      expect(result.isOk()).toBe(true);
      expect(harness.host.files.get("2026-05-19.md")?.content).toContain("# Daily 2026-05-19");
    });
  });

  describe("a plain daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("refuses to attach when another existing note already holds the anchor", async () => {
      harness.host.putFile("2026-05-19.md", "the incumbent");
      harness.host.putFile("stray.md", "");
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: meta.anchor, path: "2026-05-19.md" as VaultPath });

      const result = await harness.resolve(NoteCreationService).attachNote("daily", "stray.md" as VaultPath, meta);

      expect(result.isErr() && result.error instanceof AnchorOccupiedError).toBe(true);
    });

    it("leaves the stray note's frontmatter untouched when the anchor is occupied", async () => {
      harness.host.putFile("2026-05-19.md", "the incumbent");
      harness.host.putFile("stray.md", "");
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: meta.anchor, path: "2026-05-19.md" as VaultPath });

      await harness.resolve(NoteCreationService).attachNote("daily", "stray.md" as VaultPath, meta);

      expect(harness.host.files.get("stray.md")?.frontmatter).toEqual({});
    });

    it("attaches when the anchor's indexed note no longer exists in the vault", async () => {
      harness.host.putFile("stray.md", "");
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/gone.md" as VaultPath });

      const result = await harness.resolve(NoteCreationService).attachNote("daily", "stray.md" as VaultPath, meta);

      expect(result.isOk()).toBe(true);
    });
  });
});

describe("NoteCreationService.ensureNote — note_name binding", () => {
  it("substitutes {{note_name}} in template body with the file's basename", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) } },
    });
    harness.host.putFile("Templates/daily.md", "Hello {{note_name}}");
    const noteMeta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-20") };

    const result = await harness.resolve(NoteCreationService).ensureNote("daily", noteMeta);

    expectOk(result);
    expect(harness.host.files.get("2026-05-20.md")?.content).toBe("Hello 2026-05-20");
  });
});

describe("NoteCreationService.ensureNote — Templater", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) } },
    });
  });

  it("applies Templater to the created note's content", async () => {
    harness.host.putFile("Templates/daily.md", "# {{date}}");
    harness.templater.setTransform((content) => `${content}\n<!-- templated -->`);

    const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

    expectOk(result);
    expect(harness.host.files.get("2026-05-19.md")?.content).toBe("# 2026-05-19\n<!-- templated -->");
  });

  it("targets the created note path when applying Templater", async () => {
    harness.host.putFile("Templates/daily.md", "body");

    expectOk(await harness.resolve(NoteCreationService).ensureNote("daily", meta));

    expect(harness.templater.applyCalls).toEqual([
      { templatePath: "Templates/daily.md", targetPath: "2026-05-19.md", content: "body" },
    ]);
  });
});

describe("NoteCreationService.ensureNote — suppression guard cleanup", () => {
  describe("a journal with a template", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) } },
      });
      harness.host.putFile("Templates/daily.md", "body");
    });

    it("releases the suppression guard when the content write fails", async () => {
      vi.spyOn(harness.resolve(NotesService), "write").mockReturnValue(
        AsyncResult.err(new NoteWriteError("2026-05-19.md" as VaultPath, new Error("write failed"))),
      );

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(result.isErr()).toBe(true);
      expect(harness.resolve(SelfWriteGuard).suppresses("2026-05-19.md" as VaultPath)).toBe(false);
    });

    it("releases the suppression guard when content rendering fails", async () => {
      vi.spyOn(harness.resolve(NotesService), "read").mockReturnValue(
        AsyncResult.err(new NoteReadError("Templates/daily.md" as VaultPath, new Error("read failed"))),
      );

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(result.isErr()).toBe(true);
      expect(harness.resolve(SelfWriteGuard).suppresses("2026-05-19.md" as VaultPath)).toBe(false);
    });
  });

  describe("a plain daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("releases the suppression guard when note creation fails", async () => {
      vi.spyOn(harness.resolve(NotesService), "create").mockReturnValue(
        AsyncResult.err(new NoteCreateError("2026-05-19.md" as VaultPath, new Error("create failed"))),
      );

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(result.isErr()).toBe(true);
      expect(harness.resolve(SelfWriteGuard).suppresses("2026-05-19.md" as VaultPath)).toBe(false);
    });

    it("releases the suppression guard when frontmatter update fails", async () => {
      vi.spyOn(harness.resolve(NotesService), "updateFrontmatter").mockReturnValue(
        AsyncResult.err(new FrontmatterError("2026-05-19.md" as VaultPath, new Error("frontmatter failed"))),
      );

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expect(result.isErr()).toBe(true);
      expect(harness.resolve(SelfWriteGuard).suppresses("2026-05-19.md" as VaultPath)).toBe(false);
    });
  });
});

async function answerPrompt(harness: TestHarness, answers: Record<string, PromptAnswer>): Promise<void> {
  await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
  harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit(answers);
}

describe("NoteCreationService.ensureNote — creation prompts", () => {
  const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

  async function promptingHarness(overrides: Partial<JournalConfig> = {}): Promise<TestHarness> {
    return testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [mood], ...overrides }) } },
    });
  }

  it("names the new note from the answers", async () => {
    const harness = await promptingHarness({ nameTemplate: "{{date}} {{mood}}" });

    const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
    await answerPrompt(harness, { mood: "good" });
    const result = await promise;

    expectOk(result);
    expect(result.value.path).toBe("2026-05-19 good.md");
  });

  it("writes the answers into the new note's frontmatter", async () => {
    const harness = await promptingHarness();

    const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
    await answerPrompt(harness, { mood: "good" });
    expectOk(await promise);

    expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toMatchObject({ mood: "good" });
  });

  it("renders the answers into the note body", async () => {
    const harness = await promptingHarness({ templates: ["Templates/daily.md"] });
    harness.host.putFile("Templates/daily.md", "mood: {{mood}}");

    const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
    await answerPrompt(harness, { mood: "good" });
    expectOk(await promise);

    expect(harness.host.files.get("2026-05-19.md")?.content).toBe("mood: good");
  });

  it("does not prompt when a note already exists at the anchor", async () => {
    const harness = await promptingHarness();
    harness.host.putFile("2026-05-19.md", "existing");
    harness
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: meta.anchor, path: "2026-05-19.md" as VaultPath });

    const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

    expectOk(result);
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("does not create a note when the prompt is cancelled", async () => {
    const harness = await promptingHarness();

    const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    expect(harness.host.files.has("2026-05-19.md")).toBe(false);
  });

  it("asks the prompt as the confirmation when confirmCreation is on", async () => {
    const harness = await promptingHarness({ confirmCreation: true });

    const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    expect(harness.modals.lastOpen<{ confirming: boolean }>().props.confirming).toBe(true);
    harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit({ mood: "good" });
    expectOk(await promise);

    expect(harness.modals.opens).toHaveLength(1);
  });

  it("fails unattended when a prompt reaches the note name", async () => {
    const harness = await promptingHarness({ nameTemplate: "{{date}} {{mood}}" });

    const result = await harness
      .resolve(NoteCreationService)
      .ensureNote("daily", meta, { skipConfirmation: true, unattended: true });

    expect(result.isErr() && result.error instanceof PromptsUnansweredError).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("fails unattended when a prompt is required", async () => {
    const harness = await promptingHarness({ prompts: [{ ...mood, required: true }] });

    const result = await harness
      .resolve(NoteCreationService)
      .ensureNote("daily", meta, { skipConfirmation: true, unattended: true });

    expect(result.isErr() && result.error instanceof PromptsUnansweredError).toBe(true);
    expect(harness.host.files.has("2026-05-19.md")).toBe(false);
  });

  it("fails on the empty-name check before the unattended refusal when the path can't be derived", async () => {
    // A required prompt outside the path would normally refuse unattended creation, but the
    // path is derived before that check runs, so an empty-name failure reaches the caller
    // first. Harmless — both are refusals — but pinned so a reorder is a visible decision.
    const harness = await promptingHarness({ nameTemplate: "", prompts: [{ ...mood, required: true }] });

    const result = await harness
      .resolve(NoteCreationService)
      .ensureNote("daily", meta, { skipConfirmation: true, unattended: true });

    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("creates unattended without asking when no prompt is required or in the note name", async () => {
    const harness = await promptingHarness();

    const result = await harness
      .resolve(NoteCreationService)
      .ensureNote("daily", meta, { skipConfirmation: true, unattended: true });

    expect(result.isOk() && result.value.created).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });

  describe("a note at the derived path that the index does not know", () => {
    it("does not re-ask a note that already carries this journal's claim", async () => {
      const harness = await promptingHarness();
      harness.host.putFile("2026-05-19.md", "", {
        journal: "daily",
        "journal-date": "2026-05-19",
        mood: "great",
      });

      const result = await harness.resolve(NoteCreationService).ensureNote("daily", meta);

      expectOk(result);
      expect(result.value.created).toBe(false);
      expect(harness.modals.opens).toHaveLength(0);
    });

    it("keeps the stored answers of a note that already carries this journal's claim", async () => {
      const harness = await promptingHarness();
      harness.host.putFile("2026-05-19.md", "", {
        journal: "daily",
        "journal-date": "2026-05-19",
        mood: "great",
      });

      expectOk(await harness.resolve(NoteCreationService).ensureNote("daily", meta));

      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toMatchObject({ mood: "great" });
    });

    it("still asks when the file at the derived path carries a different journal's claim", async () => {
      const harness = await promptingHarness();
      harness.host.putFile("2026-05-19.md", "", {
        journal: "other",
        "journal-date": "2026-05-19",
      });

      const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
      await answerPrompt(harness, { mood: "good" });
      const result = await promise;

      expectOk(result);
      expect(result.value.created).toBe(false);
      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toMatchObject({ journal: "daily", mood: "good" });
    });

    it("asks and adopts an unclaimed file sitting at the derived path", async () => {
      const harness = await promptingHarness();
      harness.host.putFile("2026-05-19.md", "hand-made");

      const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
      await answerPrompt(harness, { mood: "good" });
      const result = await promise;

      expectOk(result);
      expect(result.value.created).toBe(false);
      expect(harness.host.files.get("2026-05-19.md")?.frontmatter).toMatchObject({ journal: "daily", mood: "good" });
    });

    it("still asks a journal whose note name carries an answer", async () => {
      const harness = await promptingHarness({ nameTemplate: "{{date}} {{mood}}" });
      harness.host.putFile("2026-05-19 great.md", "", {
        journal: "daily",
        "journal-date": "2026-05-19",
        mood: "great",
      });

      const promise = harness.resolve(NoteCreationService).ensureNote("daily", meta);
      await answerPrompt(harness, { mood: "good" });
      const result = await promise;

      expectOk(result);
      expect(result.value.path).toBe("2026-05-19 good.md");
    });
  });
});
