import { describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import {
  FrontmatterError,
  NoteCreateError,
  NoteReadError,
  NoteWriteError,
  NotesService,
  TemplaterService,
} from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { fakeRepo, fixedJournal } from "../testing";

import { AnchorOccupiedError, EmptyNoteNameError } from "./errors";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";

import type { JournalMetadata } from "../types";

function build(
  repo: JournalsRepository,
  notes: FakeNotesService,
  modals: FakeModalService,
  templater = new FakeTemplaterService(),
): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(TemplaterService).useValue(templater as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(SelfWriteGuard).useClass(SelfWriteGuard);
  c.register(NoteCreationService).useClass(NoteCreationService);
  return c;
}

const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

describe("NoteCreationService.ensureNote", () => {
  it("creates the file and writes frontmatter when the path is missing", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const result = await build(repo, notes, modals).resolve(NoteCreationService).ensureNote("daily", meta);
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.created).toBe(true);
    expect(result.isOk() && result.value.path).toBe("2026-05-19.md");
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
  });

  it("skips create but still writes frontmatter when the file already exists", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("2026-05-19.md" as VaultPath, "existing");
    const modals = new FakeModalService();
    const result = await build(repo, notes, modals).resolve(NoteCreationService).ensureNote("daily", meta);
    expect(result.isOk() && result.value.created).toBe(false);
  });

  it("reuses the indexed note's path when it differs from the config-derived path", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("Archive/renamed note.md" as VaultPath, "existing");
    const modals = new FakeModalService();
    const container = build(repo, notes, modals);
    container
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/renamed note.md" as VaultPath });
    const result = await container.resolve(NoteCreationService).ensureNote("daily", meta);
    expectOk(result);
    expect(result.value.path).toBe("Archive/renamed note.md");
    expect(result.value.created).toBe(false);
  });

  it("does not create a second note at the derived path when the entry is indexed elsewhere", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("Archive/renamed note.md" as VaultPath, "existing");
    const modals = new FakeModalService();
    const container = build(repo, notes, modals);
    container
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/renamed note.md" as VaultPath });
    await container.resolve(NoteCreationService).ensureNote("daily", meta);
    expect(notes.find("2026-05-19.md" as VaultPath).isNone()).toBe(true);
  });

  it("creates at the derived path when the indexed file no longer exists", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const container = build(repo, notes, modals);
    container
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/gone.md" as VaultPath });
    const result = await container.resolve(NoteCreationService).ensureNote("daily", meta);
    expectOk(result);
    expect(result.value.path).toBe("2026-05-19.md");
    expect(result.value.created).toBe(true);
  });

  it("opens confirm modal when confirmCreation is true and returns UserAborted on cancel", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const container = build(repo, notes, modals);
    const promise = container.resolve(NoteCreationService).ensureNote("daily", meta);
    await Promise.resolve();
    await Promise.resolve();
    modals.lastOpen<{ journalName: string; noteName: string }, boolean>().cancel();
    const result = await promise;
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    expect(notes.find("2026-05-19.md" as VaultPath).isNone()).toBe(true);
  });

  it("creates the file when confirmCreation is true and the modal is submitted", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const container = build(repo, notes, modals);
    const promise = container.resolve(NoteCreationService).ensureNote("daily", meta);
    await Promise.resolve();
    await Promise.resolve();
    modals.lastOpen<{ journalName: string; noteName: string }, boolean>().submit(true);
    const result = await promise;
    expect(result.isOk() && result.value.created).toBe(true);
  });

  it("does not open the confirm modal when skipConfirmation is set", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    await build(repo, notes, modals).resolve(NoteCreationService).ensureNote("daily", meta, { skipConfirmation: true });
    expect(modals.opens).toHaveLength(0);
  });

  it("creates the note when skipConfirmation bypasses confirmCreation", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const result = await build(repo, notes, modals)
      .resolve(NoteCreationService)
      .ensureNote("daily", meta, { skipConfirmation: true });
    expect(result.isOk() && result.value.created).toBe(true);
  });

  it("refuses to create a note when the name template resolves to an empty name", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) });
    const notes = new FakeNotesService();
    const result = await build(repo, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .ensureNote("daily", meta);
    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("writes no file when the name template resolves to an empty name", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) });
    const notes = new FakeNotesService();
    await build(repo, notes, new FakeModalService()).resolve(NoteCreationService).ensureNote("daily", meta);
    expect(notes.find(".md" as VaultPath).isNone()).toBe(true);
  });
});

describe("NoteCreationService.attachNote", () => {
  it("writes frontmatter and content when the existing file is empty", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# Daily {{date}}");
    notes.seed("2026-05-19.md" as VaultPath, "");
    const result = await build(repo, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta);
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expect(read.isOk() && read.value).toBe("# Daily 2026-05-19");
  });

  it("writes frontmatter only when the existing file has content", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# Daily {{date}}");
    notes.seed("2026-05-19.md" as VaultPath, "user-typed content");
    const result = await build(repo, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta);
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expect(read.isOk() && read.value).toBe("user-typed content");
  });

  it("treats whitespace-only content as empty", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    notes.seed("2026-05-19.md" as VaultPath, "   \n  \n");
    const result = await build(repo, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta);
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expect(read.isOk() && read.value).toBe("body");
  });

  it("refuses to attach when another existing note already holds the anchor", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("2026-05-19.md" as VaultPath, "the incumbent");
    notes.seed("stray.md" as VaultPath, "");
    const container = build(repo, notes, new FakeModalService());
    container
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: meta.anchor, path: "2026-05-19.md" as VaultPath });

    const result = await container.resolve(NoteCreationService).attachNote("daily", "stray.md" as VaultPath, meta);

    expect(result.isErr() && result.error instanceof AnchorOccupiedError).toBe(true);
  });

  it("leaves the stray note's frontmatter untouched when the anchor is occupied", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("2026-05-19.md" as VaultPath, "the incumbent");
    notes.seed("stray.md" as VaultPath, "");
    const container = build(repo, notes, new FakeModalService());
    container
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: meta.anchor, path: "2026-05-19.md" as VaultPath });

    await container.resolve(NoteCreationService).attachNote("daily", "stray.md" as VaultPath, meta);

    const read = await notes.read("stray.md" as VaultPath);
    expect(read.isOk() && read.value).toBe("");
  });

  it("attaches when the anchor's indexed note no longer exists in the vault", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("stray.md" as VaultPath, "");
    const container = build(repo, notes, new FakeModalService());
    container
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: meta.anchor, path: "Archive/gone.md" as VaultPath });

    const result = await container.resolve(NoteCreationService).attachNote("daily", "stray.md" as VaultPath, meta);

    expect(result.isOk()).toBe(true);
  });

  it("applies the template to an empty note even though attaching frontmatter fills the file body", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# Daily {{date}}");
    notes.seed("2026-05-19.md" as VaultPath, "");
    // Obsidian's processFrontMatter embeds a `---` block into the file text, so a note
    // reads back non-empty once frontmatter is attached. Model that here so emptiness must
    // be decided against the note's original body, not its post-frontmatter contents.
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
    const result = await build(repo, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta);
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expect(read.isOk() && read.value).toContain("# Daily 2026-05-19");
  });
});

describe("NoteCreationService.ensureNote — note_name binding", () => {
  it("substitutes {{note_name}} in template body with the file's basename", async () => {
    const noteMeta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-20") };
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "Hello {{note_name}}");
    const result = await build(repo, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .ensureNote("daily", noteMeta);
    expectOk(result);
    const read = await notes.read("2026-05-20.md" as VaultPath);
    expectOk(read);
    expect(read.value).toBe("Hello 2026-05-20");
  });
});

describe("NoteCreationService.ensureNote — Templater", () => {
  it("applies Templater to the created note's content", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# {{date}}");
    const templater = new FakeTemplaterService();
    templater.setTransform((content) => `${content}\n<!-- templated -->`);
    const result = await build(repo, notes, new FakeModalService(), templater)
      .resolve(NoteCreationService)
      .ensureNote("daily", meta);
    expectOk(result);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expectOk(read);
    expect(read.value).toBe("# 2026-05-19\n<!-- templated -->");
  });

  it("targets the created note path when applying Templater", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    const templater = new FakeTemplaterService();
    expectOk(
      await build(repo, notes, new FakeModalService(), templater)
        .resolve(NoteCreationService)
        .ensureNote("daily", meta),
    );
    expect(templater.applyCalls).toEqual([
      { templatePath: "Templates/daily.md", targetPath: "2026-05-19.md", content: "body" },
    ]);
  });
});

describe("NoteCreationService.ensureNote — suppression guard cleanup", () => {
  it("releases the suppression guard when the content write fails", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    const container = build(repo, notes, new FakeModalService());
    const service = container.resolve(NoteCreationService);
    const guard = container.resolve(SelfWriteGuard);
    vi.spyOn(notes, "write").mockReturnValue(
      AsyncResult.err(new NoteWriteError("2026-05-19.md" as VaultPath, new Error("write failed"))),
    );
    const result = await service.ensureNote("daily", meta);
    expect(result.isErr()).toBe(true);
    expect(guard.suppresses("2026-05-19.md" as VaultPath)).toBe(false);
  });

  it("releases the suppression guard when content rendering fails", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    const container = build(repo, notes, new FakeModalService());
    const service = container.resolve(NoteCreationService);
    const guard = container.resolve(SelfWriteGuard);
    vi.spyOn(notes, "read").mockReturnValue(
      AsyncResult.err(new NoteReadError("Templates/daily.md" as VaultPath, new Error("read failed"))),
    );
    const result = await service.ensureNote("daily", meta);
    expect(result.isErr()).toBe(true);
    expect(guard.suppresses("2026-05-19.md" as VaultPath)).toBe(false);
  });

  it("releases the suppression guard when note creation fails", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const container = build(repo, notes, new FakeModalService());
    const service = container.resolve(NoteCreationService);
    const guard = container.resolve(SelfWriteGuard);
    vi.spyOn(notes, "create").mockReturnValue(
      AsyncResult.err(new NoteCreateError("2026-05-19.md" as VaultPath, new Error("create failed"))),
    );
    const result = await service.ensureNote("daily", meta);
    expect(result.isErr()).toBe(true);
    expect(guard.suppresses("2026-05-19.md" as VaultPath)).toBe(false);
  });

  it("releases the suppression guard when frontmatter update fails", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const container = build(repo, notes, new FakeModalService());
    const service = container.resolve(NoteCreationService);
    const guard = container.resolve(SelfWriteGuard);
    vi.spyOn(notes, "updateFrontmatter").mockReturnValue(
      AsyncResult.err(new FrontmatterError("2026-05-19.md" as VaultPath, new Error("frontmatter failed"))),
    );
    const result = await service.ensureNote("daily", meta);
    expect(result.isErr()).toBe(true);
    expect(guard.suppresses("2026-05-19.md" as VaultPath)).toBe(false);
  });
});
