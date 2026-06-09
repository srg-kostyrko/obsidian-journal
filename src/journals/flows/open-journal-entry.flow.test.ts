import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows, FlowsModule, UserAborted } from "@/infrastructure/flows";
import { NotesService, TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { SelfWriteGuard } from "../notes/self-write-guard";
import { TemplateContentService } from "../notes/template-content";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { fakeRepo, fixedJournal } from "../testing";

import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

function build(
  repo: JournalsRepository,
  notes: FakeNotesService,
  workspace: FakeWorkspaceService,
  modals: FakeModalService,
  templater = new FakeTemplaterService(),
) {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.register(JournalsRepository).useValue(repo);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
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
  c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  return c;
}

describe("OpenJournalEntryFlow — cursor jump", () => {
  it("jumps the cursor after opening a newly created note", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const workspace = new FakeWorkspaceService();
    const templater = new FakeTemplaterService();
    await build(repo, notes, workspace, new FakeModalService(), templater)
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    expect(templater.cursorJumps).toEqual(["2026-05-19.md"]);
  });

  it("does not jump the cursor when the note already existed", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    notes.seed("2026-05-19.md" as VaultPath, "existing");
    const workspace = new FakeWorkspaceService();
    const templater = new FakeTemplaterService();
    await build(repo, notes, workspace, new FakeModalService(), templater)
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    expect(templater.cursorJumps).toEqual([]);
  });
});

describe("OpenJournalEntryFlow", () => {
  it("ensures the note and opens it in the workspace", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const notes = new FakeNotesService();
    const workspace = new FakeWorkspaceService();
    const modals = new FakeModalService();
    const container = build(repo, notes, workspace, modals);
    const result = await container
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("2026-05-19.md" as VaultPath)).toBe(true);
  });

  it("does not open the workspace when ensureNote returns UserAborted", async () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) });
    const notes = new FakeNotesService();
    const workspace = new FakeWorkspaceService();
    const modals = new FakeModalService();
    const container = build(repo, notes, workspace, modals);
    const promise = container
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    await Promise.resolve();
    await Promise.resolve();
    modals.lastOpen<{ journalName: string; noteName: string }, boolean>().cancel();
    const result = await promise;
    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    expect(workspace.isOpen("2026-05-19.md" as VaultPath)).toBe(false);
  });
});
