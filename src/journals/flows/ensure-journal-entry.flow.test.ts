import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows, FlowsModule } from "@/infrastructure/flows";
import { NotesService, NoticeService, TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  FakeNoticeService,
  FakeNotesService,
  FakeTemplaterService,
  FakeWorkspaceService,
} from "@/infrastructure/host/testing";
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

import { EnsureJournalEntryFlow } from "./ensure-journal-entry.flow";

import type { JournalConfig } from "../config";

function build(journals: Record<string, JournalConfig>) {
  const c = new Container();
  const notes = new FakeNotesService();
  const workspace = new FakeWorkspaceService();
  const modals = new FakeModalService();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.register(NoticeService).useValue(new FakeNoticeService());
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(SelfWriteGuard).useClass(SelfWriteGuard);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(EnsureJournalEntryFlow).useClass(EnsureJournalEntryFlow);
  return { flows: c.resolve(Flows), notes, workspace, modals };
}

describe("EnsureJournalEntryFlow", () => {
  it("creates the note without opening it", async () => {
    const { flows, notes, workspace } = build({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await flows.invoke(EnsureJournalEntryFlow, {
      journalName: "daily",
      anchor: anchor("2026-05-19"),
    });

    expect(result.isOk() && result.value).toEqual({ path: "2026-05-19.md", created: true });
    expect(notes.find("2026-05-19.md" as VaultPath).isSome()).toBe(true);
    expect(workspace.isOpen("2026-05-19.md" as VaultPath)).toBe(false);
  });

  it("reports created false for a note that already exists", async () => {
    const { flows, notes } = build({ daily: fixedJournal("daily", { type: "day" }) });
    notes.seed("2026-05-19.md" as VaultPath, "existing");

    const result = await flows.invoke(EnsureJournalEntryFlow, {
      journalName: "daily",
      anchor: anchor("2026-05-19"),
    });

    expect(result.isOk() && result.value.created).toBe(false);
  });

  it("honors the journal's creation prompt by default", async () => {
    const { flows, modals } = build({
      daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }),
    });

    const pending = flows.invoke(EnsureJournalEntryFlow, {
      journalName: "daily",
      anchor: anchor("2026-05-19"),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(modals.opens).toHaveLength(1);

    modals.lastOpen<unknown, boolean>().submit(true);
    const settled = await pending;
    expect(settled.isOk()).toBe(true);
  });

  it("skips the creation prompt when asked to", async () => {
    const { flows, modals } = build({
      daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }),
    });

    const result = await flows.invoke(EnsureJournalEntryFlow, {
      journalName: "daily",
      anchor: anchor("2026-05-19"),
      skipConfirmation: true,
    });

    expect(modals.opens).toHaveLength(0);
    expect(result.isOk() && result.value.created).toBe(true);
  });
});
