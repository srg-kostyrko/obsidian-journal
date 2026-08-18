import { afterEach, assert, beforeEach, describe, it, expect } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows, FlowsModule, UserAborted } from "@/infrastructure/flows";
import { NotesService, SuggestService, TemplaterService, WorkspaceService, NoticeService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeSuggestService } from "@/infrastructure/host/suggests/testing";
import {
  FakeNotesService,
  FakeTemplaterService,
  FakeWorkspaceService,
  FakeNoticeService,
} from "@/infrastructure/host/testing";
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

import { JournalDateResolver } from "./journal-date-resolver";
import { OpenDateFlow } from "./open-date.flow";
import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

function build(repo: JournalsRepository, suggests: FakeSuggestService) {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);
  c.register(NoticeService).useValue(new FakeNoticeService());
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
  c.register(JournalDateResolver).useClass(JournalDateResolver);
  c.register(OpenDateFlow).useClass(OpenDateFlow);
  return { container: c, notes, workspace };
}

const TIMELINE_OPEN = { start: anchor("2020-01-01"), end: { kind: "never" as const } };

describe("OpenDateFlow", () => {
  let teardown: () => void;

  // The mid-period cases below expect Sunday-anchored weeks, so the grid has to be stated rather
  // than inherited from whatever locale the machine happens to run under.
  beforeEach(() => {
    ({ teardown } = installTestCalendar({ dow: 0, doy: 6 }));
  });

  afterEach(() => {
    teardown();
  });

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

  it("picks via a menu at the mouse event when pickAt is provided", async () => {
    // Mouse-driven clicks disambiguate with a native menu at the pointer; the
    // centered suggest stays for keyboard/command/URI entry points.
    const repo = fakeRepo({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container, workspace } = build(repo, suggests);
    workspace.pickFromMenuChoice = "b";
    const event = new MouseEvent("click");
    const result = await container.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), pickAt: event });
    expect(result.isOk()).toBe(true);
    expect(workspace.pickFromMenuCalls).toEqual([{ labels: ["a", "b"], event }]);
    expect(workspace.isOpen("B/2026-05-19.md" as VaultPath)).toBe(true);
    expect(suggests.opens.length).toBe(0);
  });

  it("returns UserAborted when the pick menu is dismissed", async () => {
    const repo = fakeRepo({
      a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
      b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
    });
    const suggests = new FakeSuggestService();
    const { container, workspace } = build(repo, suggests);
    workspace.pickFromMenuChoice = null;
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), pickAt: new MouseEvent("click") });
    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
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

  it("stores the period's canonical anchor when the date falls mid-period", async () => {
    const repo = fakeRepo({
      weekly: fixedJournal("weekly", { type: "week" }, { folder: "W", timeline: TIMELINE_OPEN }),
    });
    const { container, notes } = build(repo, new FakeSuggestService());
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), journalNames: ["weekly"] });
    assert(result.isOk());
    expect(notes.frontmatterOf(result.value.path)?.["journal-date"]).toBe("2026-05-17");
  });

  it("reaches an existing entry under existingOnly when the date falls mid-period", async () => {
    const repo = fakeRepo({
      weekly: fixedJournal("weekly", { type: "week" }, { folder: "W", timeline: TIMELINE_OPEN }),
    });
    const { container, notes, workspace } = build(repo, new FakeSuggestService());
    const existing = "W/2026-05-17.md" as VaultPath;
    notes.seed(existing, "", { journal: "weekly", "journal-date": "2026-05-17" });
    container.resolve(JournalsIndex).register({ journalName: "weekly", anchor: anchor("2026-05-17"), path: existing });
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), journalNames: ["weekly"], existingOnly: true });
    expect(result.isOk()).toBe(true);
    expect(workspace.isOpen(existing)).toBe(true);
  });

  it("re-anchors a note left at a mid-period date by an earlier open", async () => {
    const repo = fakeRepo({
      weekly: fixedJournal("weekly", { type: "week" }, { folder: "W", timeline: TIMELINE_OPEN }),
    });
    const { container, notes } = build(repo, new FakeSuggestService());
    const stale = "W/2026-W21.md" as VaultPath;
    notes.seed(stale, "", { journal: "weekly", "journal-date": "2026-05-19" });
    const result = await container
      .resolve(Flows)
      .invoke(OpenDateFlow, { anchor: anchor("2026-05-20"), journalNames: ["weekly"] });
    assert(result.isOk());
    // Asserted on the seeded path, not the returned one: a note created elsewhere would
    // carry the canonical date too, and prove nothing about repairing this one.
    expect(notes.frontmatterOf(stale)?.["journal-date"]).toBe("2026-05-17");
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
