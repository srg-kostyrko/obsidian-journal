import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NoteDeleteError, NoteNotFoundError, NotesService, TemplaterService } from "@/infrastructure/host";
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

import { AnchorOccupiedError } from "./errors";
import { NoteConnectionService } from "./note-connection";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

function build(
  repo: JournalsRepository,
  notes: FakeNotesService,
  modals: FakeModalService,
  templater = new FakeTemplaterService(),
): { container: Container; index: JournalsIndex } {
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
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(NoteConnectionService).useClass(NoteConnectionService);
  const index = c.resolve(JournalsIndex);
  return { container: c, index };
}

async function readFrontmatter(notes: FakeNotesService, path: VaultPath): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  await notes.updateFrontmatter(path, (fm) => {
    captured = { ...fm };
  });
  return captured;
}

describe("NoteConnectionService", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });

  afterEach(() => {
    teardown();
  });

  describe("disconnect", () => {
    it("strips journal-owned frontmatter keys from a connected note", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const path = "2026-06-01.md" as VaultPath;
      notes.seed(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path });

      const result = await container.resolve(NoteConnectionService).disconnect(path);

      expect(result.isOk()).toBe(true);
      const fm = await readFrontmatter(notes, path);
      expect(fm).toEqual({ title: "keep" });
    });

    it("falls back to default-key stripping for an orphaned note with a stale journal key", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const path = "2026-06-01.md" as VaultPath;
      notes.seed(path, "content", {
        journal: "deleted",
        "journal-date": "2026-06-01",
        "journal-index": 3,
        body: "keep",
      });
      const { container } = build(repo, notes, new FakeModalService());
      // NOT registering in index — simulating an orphaned note

      const result = await container.resolve(NoteConnectionService).disconnect(path);

      expect(result.isOk()).toBe(true);
      const fm = await readFrontmatter(notes, path);
      expect(fm).toEqual({ body: "keep" });
    });
  });

  describe("disconnectAll", () => {
    it("strips the journal's frontmatter keys from every connected note", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      notes.seed(first, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      notes.seed(second, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await container.resolve(NoteConnectionService).disconnectAll("daily");

      expect(await readFrontmatter(notes, first)).toEqual({ title: "keep" });
      expect(await readFrontmatter(notes, second)).toEqual({ title: "keep" });
    });

    it("clears the remaining notes when one note's update fails", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const failing = "a.md" as VaultPath;
      const surviving = "b.md" as VaultPath;
      notes.seed(failing, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      notes.seed(surviving, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
      const original = notes.updateFrontmatter.bind(notes);
      vi.spyOn(notes, "updateFrontmatter").mockImplementation((path, mutate) =>
        path === failing ? AsyncResult.err(new NoteNotFoundError(failing)) : original(path, mutate),
      );

      await container.resolve(NoteConnectionService).disconnectAll("daily");

      expect(await readFrontmatter(notes, surviving)).toEqual({ title: "keep" });
      vi.mocked(notes.updateFrontmatter).mockRestore();
      expect(await readFrontmatter(notes, failing)).toEqual({
        journal: "daily",
        "journal-date": "2026-06-01",
        title: "keep",
      });
    });
  });

  describe("deleteAll", () => {
    it("trashes every connected note", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      notes.seed(first, "content", { journal: "daily", "journal-date": "2026-06-01" });
      notes.seed(second, "content", { journal: "daily", "journal-date": "2026-06-02" });
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await container.resolve(NoteConnectionService).deleteAll("daily");

      expect(notes.find(first).isNone()).toBe(true);
      expect(notes.find(second).isNone()).toBe(true);
    });

    it("trashes the remaining notes when one note's deletion fails", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const failing = "a.md" as VaultPath;
      const surviving = "b.md" as VaultPath;
      notes.seed(failing, "content", { journal: "daily", "journal-date": "2026-06-01" });
      notes.seed(surviving, "content", { journal: "daily", "journal-date": "2026-06-02" });
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
      const original = notes.delete.bind(notes);
      vi.spyOn(notes, "delete").mockImplementation((path) =>
        path === failing ? AsyncResult.err(new NoteDeleteError(failing, new Error("boom"))) : original(path),
      );

      await container.resolve(NoteConnectionService).deleteAll("daily");

      expect(notes.find(surviving).isNone()).toBe(true);
      expect(notes.find(failing).isSome()).toBe(true);
    });
  });

  describe("reconnectAll", () => {
    it("rewrites the journal name in every connected note to the new name", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      notes.seed(first, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      notes.seed(second, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await container.resolve(NoteConnectionService).reconnectAll("daily", "morning");

      expect(await readFrontmatter(notes, first)).toEqual({
        journal: "morning",
        "journal-date": "2026-06-01",
        title: "keep",
      });
      expect(await readFrontmatter(notes, second)).toEqual({
        journal: "morning",
        "journal-date": "2026-06-02",
        title: "keep",
      });
    });

    it("rewrites the remaining notes when one note's update fails", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const failing = "a.md" as VaultPath;
      const surviving = "b.md" as VaultPath;
      notes.seed(failing, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      notes.seed(surviving, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
      const original = notes.updateFrontmatter.bind(notes);
      vi.spyOn(notes, "updateFrontmatter").mockImplementation((path, mutate) =>
        path === failing ? AsyncResult.err(new NoteNotFoundError(failing)) : original(path, mutate),
      );

      await container.resolve(NoteConnectionService).reconnectAll("daily", "morning");

      expect(await readFrontmatter(notes, surviving)).toEqual({
        journal: "morning",
        "journal-date": "2026-06-02",
        title: "keep",
      });
      vi.mocked(notes.updateFrontmatter).mockRestore();
      expect(await readFrontmatter(notes, failing)).toEqual({
        journal: "daily",
        "journal-date": "2026-06-01",
        title: "keep",
      });
    });
  });

  describe("connect", () => {
    it("attaches the note at the resolved anchor when the slot is free", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const path = "inbox/note.md" as VaultPath;
      notes.seed(path, "");
      const { container } = build(repo, notes, new FakeModalService());

      const result = await container.resolve(NoteConnectionService).connect("daily", path, anchor("2026-06-01"));

      expect(result.isOk()).toBe(true);
      const fm = await readFrontmatter(notes, path);
      expect(fm.journal).toBe("daily");
      expect(typeof fm["journal-date"]).toBe("string");
    });

    it("errors with AnchorOccupiedError when another note holds the anchor and override is not set", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const occupantPath = "2026-06-01.md" as VaultPath;
      const incomingPath = "inbox/note.md" as VaultPath;
      notes.seed(occupantPath, "content", { journal: "daily", "journal-date": "2026-06-01" });
      notes.seed(incomingPath, "");
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: occupantPath });

      const result = await container
        .resolve(NoteConnectionService)
        .connect("daily", incomingPath, anchor("2026-06-01"));

      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error instanceof AnchorOccupiedError).toBe(true);
    });

    it("disconnects the occupant first when override is true", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const occupantPath = "2026-06-01.md" as VaultPath;
      const incomingPath = "inbox/note.md" as VaultPath;
      notes.seed(occupantPath, "content", { journal: "daily", "journal-date": "2026-06-01" });
      notes.seed(incomingPath, "");
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: occupantPath });

      const result = await container
        .resolve(NoteConnectionService)
        .connect("daily", incomingPath, anchor("2026-06-01"), { override: true });

      expect(result.isOk()).toBe(true);
      const occupantFm = await readFrontmatter(notes, occupantPath);
      expect(occupantFm.journal).toBeUndefined();
      const incomingFm = await readFrontmatter(notes, incomingPath);
      expect(incomingFm.journal).toBe("daily");
    });

    it("transfers the anchor's stored endDate to the new note when overriding", async () => {
      const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
      const notes = new FakeNotesService();
      const occupantPath = "2026-06-01.md" as VaultPath;
      const incomingPath = "inbox/note.md" as VaultPath;
      notes.seed(occupantPath, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-end-date": "2026-06-05",
      });
      notes.seed(incomingPath, "");
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: occupantPath,
        endDate: anchor("2026-06-05"),
      });

      const result = await container
        .resolve(NoteConnectionService)
        .connect("daily", incomingPath, anchor("2026-06-01"), { override: true });

      expect(result.isOk()).toBe(true);
      const incomingFm = await readFrontmatter(notes, incomingPath);
      expect(incomingFm["journal-end-date"]).toBe("2026-06-05");
    });

    it("renames and moves the note to the configured path when rename and move are true", async () => {
      const repo = fakeRepo({
        daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }),
      });
      const notes = new FakeNotesService();
      const sourcePath = "inbox/note.md" as VaultPath;
      const configuredPath = "Journal/2026-06-01.md" as VaultPath;
      notes.seed(sourcePath, "");
      const { container } = build(repo, notes, new FakeModalService());

      const result = await container
        .resolve(NoteConnectionService)
        .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

      expect(result.isOk()).toBe(true);
      expect(notes.find(sourcePath).isNone()).toBe(true);
      expect(notes.find(configuredPath).isSome()).toBe(true);
      const fm = await readFrontmatter(notes, configuredPath);
      expect(fm.journal).toBe("daily");
    });

    it("trashes the occupant when overriding and relocating onto its path", async () => {
      const repo = fakeRepo({
        daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }),
      });
      const notes = new FakeNotesService();
      const occupantPath = "Journal/2026-06-01.md" as VaultPath;
      const incomingPath = "inbox/note.md" as VaultPath;
      notes.seed(occupantPath, "OCCUPANT", { journal: "daily", "journal-date": "2026-06-01" });
      notes.seed(incomingPath, "INCOMING");
      const { container, index } = build(repo, notes, new FakeModalService());
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: occupantPath });

      const result = await container
        .resolve(NoteConnectionService)
        .connect("daily", incomingPath, anchor("2026-06-01"), { override: true, rename: true, move: true });

      expectOk(result);
      expect(notes.find(incomingPath).isNone()).toBe(true);
      expect(notes.find(occupantPath).isSome()).toBe(true);
      const content = await notes.read(occupantPath);
      expectOk(content);
      expect(content.value).toBe("INCOMING");
      const fm = await readFrontmatter(notes, occupantPath);
      expect(fm.journal).toBe("daily");
    });
  });
});
