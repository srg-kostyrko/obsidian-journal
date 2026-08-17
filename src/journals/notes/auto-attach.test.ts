import { describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { NoteMetadata, VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  FakeNoteMetadataService,
  FakeNotesService,
  FakeTemplaterService,
  FakeWorkspaceService,
} from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { customJournal, fakeRepo, fixedJournal } from "../testing";
import { TimelineService } from "../timeline";

import { AutoAttachService } from "./auto-attach";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";

function loadedWorkspace(): FakeWorkspaceService {
  const workspace = new FakeWorkspaceService();
  workspace.setLayoutReady(true);
  return workspace;
}

function build(
  repo: JournalsRepository,
  notes: FakeNotesService,
  metadata: FakeNoteMetadataService = new FakeNoteMetadataService(),
  workspace: FakeWorkspaceService = loadedWorkspace(),
): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
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
  c.register(AutoAttachService).useClass(AutoAttachService);
  return c;
}

describe("AutoAttachService", () => {
  it("attaches a newly-created note matching exactly one journal", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe("daily");
    expect(spy.mock.calls[0]?.[1]).toBe("2026-05-19.md");
    expect(spy.mock.calls[0]?.[2]).toMatchObject({ journalName: "daily", anchor: "2026-05-19" });
  });

  it("does nothing for a path that doesn't match any journal", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { folder: "Diary", timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    await container.resolve(AutoAttachService).initialize();
    await notes.create("Inbox/random.md" as VaultPath, "");
    notes.emitMetadataChanged("Inbox/random.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(
      container
        .resolve(JournalsIndex)
        .entryByPath("Inbox/random.md" as VaultPath)
        .isNone(),
    ).toBe(true);
  });

  it("does nothing when the path matches multiple journals", async () => {
    const repo = fakeRepo({
      a: fixedJournal("a", { type: "day" }, { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } }),
      b: fixedJournal("b", { type: "day" }, { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } }),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips paths the plugin just created via ensureNote", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const creation = container.resolve(NoteCreationService);
    const attachSpy = vi.spyOn(creation, "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await creation.ensureNote("daily", { journalName: "daily", anchor: anchor("2026-05-19") });
    await new Promise((r) => window.setTimeout(r, 0));
    expect(attachSpy).not.toHaveBeenCalled();
  });

  it("filters candidates by timeline.contains", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2026-06-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("does nothing when the path is already indexed", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    container.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: anchor("2026-05-19"),
      path: "2026-05-19.md" as VaultPath,
    });
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("attaches a note that is renamed into a matching path", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    notes.seed("Inbox/draft.md" as VaultPath, "");
    await container.resolve(AutoAttachService).initialize();
    await notes.rename("Inbox/draft.md" as VaultPath, "2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe("2026-05-19.md");
  });

  it("leaves a note claiming a journal this version doesn't know", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const metadata = new FakeNoteMetadataService();
    metadata.setMetadata(
      "2026-05-19.md" as VaultPath,
      {
        properties: { journal: "legacy-id", "journal-section": "day" },
      } as unknown as NoteMetadata,
    );
    const container = build(repo, notes, metadata);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores the notes Obsidian replays while the vault is still loading", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes, new FakeNoteMetadataService(), new FakeWorkspaceService());
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    await notes.create("2026-05-19.md" as VaultPath, "");
    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  // A rename re-keys metadataCache without re-parsing, so no metadata-changed follows it. A
  // renamed path held back to wait for one would never be adopted at all.
  it("attaches a renamed note without waiting for a metadata-changed that never comes", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();

    // Created at a non-matching path and renamed into a matching one before anything parsed it,
    // so the create is still parked and the rename is the only signal that will ever arrive.
    await notes.create("Inbox/draft.md" as VaultPath, "");
    await notes.rename("Inbox/draft.md" as VaultPath, "2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe("2026-05-19.md");
  });

  it("waits for a created note to be parsed before deciding anything about it", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();

    await notes.create("2026-05-19.md" as VaultPath, "");
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();

    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("leaves a synced custom-interval note alone once parsing registers it", async () => {
    const repo = fakeRepo({
      sprint: customJournal("sprint", "week", 2, "2026-08-03", { nameTemplate: "{{date}}" }),
    });
    const notes = new FakeNotesService();
    const container = build(repo, notes);
    const index = container.resolve(JournalsIndex);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();

    // Sync writes the note; Obsidian has not parsed it, so nothing knows its manual end date yet.
    await notes.create("2026-08-03.md" as VaultPath, "");
    // Parsing registers it through VaultSubscriptionService, which subscribes ahead of auto-attach.
    index.register({
      journalName: "sprint",
      anchor: anchor("2026-08-03"),
      path: "2026-08-03.md" as VaultPath,
      endDate: anchor("2026-08-23"),
    });
    notes.emitMetadataChanged("2026-08-03.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));

    expect(spy).not.toHaveBeenCalled();
  });

  it("attaches a note created once the vault has finished loading", async () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { timeline: { start: anchor("2020-01-01"), end: { kind: "never" } } },
      ),
    });
    const notes = new FakeNotesService();
    const workspace = new FakeWorkspaceService();
    const container = build(repo, notes, new FakeNoteMetadataService(), workspace);
    const spy = vi.spyOn(container.resolve(NoteCreationService), "attachNote");
    await container.resolve(AutoAttachService).initialize();
    workspace.setLayoutReady(true);
    await notes.create("2026-05-19.md" as VaultPath, "");
    notes.emitMetadataChanged("2026-05-19.md" as VaultPath);
    await new Promise((r) => window.setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
