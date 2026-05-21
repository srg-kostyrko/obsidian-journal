import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { expectOk } from "@/infrastructure/result/testing";
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { fakeSettings, fixedJournal } from "../testing";

import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

import type { JournalMetadata } from "../types";

function build(
  settings: SettingsService,
  notes: FakeNotesService,
  modals: FakeModalService,
  templater = new FakeTemplaterService(),
): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
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
  c.register(NoteCreationService).useClass(NoteCreationService);
  return c;
}

const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

describe("NoteCreationService.ensureNote", () => {
  it("creates the file and writes frontmatter when the path is missing", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const result = await build(settings, notes, modals).resolve(NoteCreationService).ensureNote("daily", meta);
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.created).toBe(true);
    expect(result.isOk() && result.value.path).toBe("2026-05-19.md");
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
  });

  it("skips create but still writes frontmatter when the file already exists", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("2026-05-19.md" as VaultPath, "existing");
    const modals = new FakeModalService();
    const result = await build(settings, notes, modals).resolve(NoteCreationService).ensureNote("daily", meta);
    expect(result.isOk() && result.value.created).toBe(false);
  });

  it("opens confirm modal when confirmCreation is true and returns UserAborted on cancel", async () => {
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const container = build(settings, notes, modals);
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
    const settings = fakeSettings({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const modals = new FakeModalService();
    const container = build(settings, notes, modals);
    const promise = container.resolve(NoteCreationService).ensureNote("daily", meta);
    await Promise.resolve();
    await Promise.resolve();
    modals.lastOpen<{ journalName: string; noteName: string }, boolean>().submit(true);
    const result = await promise;
    expect(result.isOk() && result.value.created).toBe(true);
  });
});

describe("NoteCreationService.attachNote", () => {
  it("writes frontmatter and content when the existing file is empty", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# Daily {{date}}");
    notes.seed("2026-05-19.md" as VaultPath, "");
    const result = await build(settings, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta);
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expect(read.isOk() && read.value).toBe("# Daily 2026-05-19");
  });

  it("writes frontmatter only when the existing file has content", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# Daily {{date}}");
    notes.seed("2026-05-19.md" as VaultPath, "user-typed content");
    const result = await build(settings, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta);
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expect(read.isOk() && read.value).toBe("user-typed content");
  });

  it("treats whitespace-only content as empty", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    notes.seed("2026-05-19.md" as VaultPath, "   \n  \n");
    const result = await build(settings, notes, new FakeModalService())
      .resolve(NoteCreationService)
      .attachNote("daily", "2026-05-19.md" as VaultPath, meta);
    expect(result.isOk()).toBe(true);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expect(read.isOk() && read.value).toBe("body");
  });
});

describe("NoteCreationService.ensureNote — note_name binding", () => {
  it("substitutes {{note_name}} in template body with the file's basename", async () => {
    const noteMeta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-20") };
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "Hello {{note_name}}");
    const result = await build(settings, notes, new FakeModalService())
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
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "# {{date}}");
    const templater = new FakeTemplaterService();
    templater.setTransform((content) => `${content}\n<!-- templated -->`);
    const result = await build(settings, notes, new FakeModalService(), templater)
      .resolve(NoteCreationService)
      .ensureNote("daily", meta);
    expectOk(result);
    const read = await notes.read("2026-05-19.md" as VaultPath);
    expectOk(read);
    expect(read.value).toBe("# 2026-05-19\n<!-- templated -->");
  });

  it("targets the created note path when applying Templater", async () => {
    const settings = fakeSettings({
      daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }),
    });
    const notes = new FakeNotesService();
    notes.seed("Templates/daily.md" as VaultPath, "body");
    const templater = new FakeTemplaterService();
    expectOk(
      await build(settings, notes, new FakeModalService(), templater)
        .resolve(NoteCreationService)
        .ensureNote("daily", meta),
    );
    expect(templater.applyCalls).toEqual([
      { templatePath: "Templates/daily.md", targetPath: "2026-05-19.md", content: "body" },
    ]);
  });
});
