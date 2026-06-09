import { describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows, FlowsModule, UserAborted } from "@/infrastructure/flows";
import { NotesService, SuggestService, TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import { FakeNotesService, FakeTemplaterService, FakeWorkspaceService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoApplicableJournals } from "../notes/errors";
import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { SelfWriteGuard } from "../notes/self-write-guard";
import { TemplateContentService } from "../notes/template-content";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { fakeRepo, fixedJournal } from "../testing";
import { TimelineService } from "../timeline";

import { OpenDateFlow } from "./open-date.flow";
import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

function build(repo: JournalsRepository, suggests: FakeSuggestService) {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  const notes = new FakeNotesService();
  const workspace = new FakeWorkspaceService();
  c.register(JournalsRepository).useValue(repo);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(SuggestService).useValue(suggests as unknown as SuggestService);
  c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(TimelineService).useClass(TimelineService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(SelfWriteGuard).useClass(SelfWriteGuard);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  c.register(OpenDateFlow).useClass(OpenDateFlow);
  return { container: c, notes, workspace };
}

const TIMELINE_OPEN = { start: anchor("2020-01-01"), end: { kind: "never" as const } };

describe("OpenDateFlow", () => {
  it("errors with NoApplicableJournals when no journal covers the anchor", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2030-01-01"), end: { kind: "never" } } },
      ),
    });
    const { container } = build(repo, new FakeSuggestService());
    const result = await container.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });
    expect(result.isErr() && result.error instanceof NoApplicableJournals).toBe(true);
  });

  it("dispatches OpenJournalEntryFlow directly when exactly one journal applies", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container, workspace } = build(repo, suggests);
    const result = await container.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("2026-05-19.md" as VaultPath)).toBe(true);
    expect(suggests.opens.length).toBe(0);
  });

  it("opens the suggest when multiple journals apply and dispatches the chosen one", async () => {
    const repo = fakeRepo({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container, workspace } = build(repo, suggests);
    const promise = container.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });
    await Promise.resolve();
    await Promise.resolve();
    suggests.lastOpen<string[], string>().choose("b");
    const result = await promise;
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("B/2026-05-19.md" as VaultPath)).toBe(true);
  });

  it("returns UserAborted when the suggest is cancelled", async () => {
    const repo = fakeRepo({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container } = build(repo, suggests);
    const promise = container.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });
    await Promise.resolve();
    await Promise.resolve();
    suggests.lastOpen<string[], string>().cancel();
    const result = await promise;
    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
  });

  it("filters by existingOnly when requested", async () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { timeline: TIMELINE_OPEN }),
    });
    const { container } = build(repo, new FakeSuggestService());
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), existingOnly: true });
    expect(result.isErr() && result.error instanceof NoApplicableJournals).toBe(true);
  });

  it("narrows by journalNames before timeline filtering", async () => {
    const repo = fakeRepo({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const { container, workspace } = build(repo, new FakeSuggestService());
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), journalNames: ["a"] });
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen("A/2026-05-19.md" as VaultPath)).toBe(true);
  });
});
