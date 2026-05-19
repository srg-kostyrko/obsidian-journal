import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
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

function build(settings: SettingsService, notes: FakeNotesService, modals: FakeModalService): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(SettingsService).useValue(settings);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
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
