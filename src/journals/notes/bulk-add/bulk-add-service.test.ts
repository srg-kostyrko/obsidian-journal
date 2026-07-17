import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoteMetadataService, FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { expectOk } from "@/infrastructure/result/testing";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { JournalsIndex } from "../../journals-index";
import { NumberingService } from "../../numbering";
import { JournalsRepository } from "../../repository";
import { fakeRepo, fixedJournal } from "../../testing";
import { TimelineService } from "../../timeline";
import { NoteConnectionService } from "../note-connection";
import { NoteCreationService } from "../note-creation";
import { NotePathService } from "../note-path";
import { SelfWriteGuard } from "../self-write-guard";
import { TemplateContentService } from "../template-content";

import { BulkAddService } from "./bulk-add-service";
import { defaultBulkAddParameters } from "./config";

import type { PlannedAction } from "./bulk-add-service";
import type { BulkAddParameters } from "./config";

function plannedAction(overrides: Partial<PlannedAction> = {}): PlannedAction {
  return {
    kind: "action",
    path: "src/note.md" as VaultPath,
    anchor: anchor("2026-06-01"),
    targetPath: "src/note.md" as VaultPath,
    existing: "none",
    folder: "n/a",
    name: "n/a",
    ...overrides,
  };
}

function makeParameters(overrides: Partial<BulkAddParameters> = {}): BulkAddParameters {
  return { ...defaultBulkAddParameters(), ...overrides };
}

function build(): {
  service: BulkAddService;
  notes: FakeNotesService;
  metadata: FakeNoteMetadataService;
  index: JournalsIndex;
} {
  const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }) });
  const notes = new FakeNotesService();
  const modals = new FakeModalService();
  const metadata = new FakeNoteMetadataService();

  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(ModalService).useValue(modals as unknown as ModalService);
  c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  c.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(SelfWriteGuard).useClass(SelfWriteGuard);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(NoteConnectionService).useClass(NoteConnectionService);
  c.register(TimelineService).useClass(TimelineService);
  c.register(BulkAddService).useClass(BulkAddService);

  const service = c.resolve(BulkAddService);
  const index = c.resolve(JournalsIndex);

  return { service, notes, metadata, index };
}

describe("BulkAddService", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });

  afterEach(() => {
    teardown();
  });

  describe("plan", () => {
    it("skips a note that is already connected", async () => {
      const { service, notes, index } = build();
      notes.seed("src/2026-06-01.md" as VaultPath, "", {});
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: "src/2026-06-01.md" as VaultPath });
      const planResult = await service.plan("daily", makeParameters({ folder: "src" }));
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
      expect(note).toEqual({ kind: "skip", path: "src/2026-06-01.md", reason: "already-connected" });
    });

    it("skips a note that fails the filters", async () => {
      const { service, notes, metadata } = build();
      notes.seed("src/2026-06-01.md" as VaultPath);
      metadata.setMetadata("src/2026-06-01.md" as VaultPath, {
        title: "2026-06-01",
        tags: [],
        properties: {},
        tasks: [],
      });
      const planResult = await service.plan(
        "daily",
        makeParameters({
          folder: "src",
          filterCombinator: "and",
          filters: [{ type: "title", condition: "contains", value: "meeting" }],
        }),
      );
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
      expect(note?.kind === "skip" && note.reason).toBe("filtered");
    });

    it("skips a note whose title has no parseable date", async () => {
      const { service, notes, metadata } = build();
      notes.seed("src/hello.md" as VaultPath);
      metadata.setMetadata("src/hello.md" as VaultPath, { title: "hello", tags: [], properties: {}, tasks: [] });
      const planResult = await service.plan("daily", makeParameters({ folder: "src" }));
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/hello.md");
      expect(note?.kind === "skip" && note.reason).toBe("no-date");
    });

    it("plans a connect action resolving the folder decision from params", async () => {
      const { service, notes, metadata } = build();
      notes.seed("src/2026-06-01.md" as VaultPath);
      metadata.setMetadata("src/2026-06-01.md" as VaultPath, {
        title: "2026-06-01",
        tags: [],
        properties: {},
        tasks: [],
      });
      const planResult = await service.plan("daily", makeParameters({ folder: "src", otherFolder: "move" }));
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
      expect(note?.kind).toBe("action");
      expect(note?.kind === "action" && note.anchor).toBe("2026-06-01");
      expect(note?.kind === "action" && note.folder).toBe("move"); // src != configured "Journal"
    });

    it("ignores a date-named attachment in the source folder", async () => {
      const { service, notes } = build();
      notes.seed("src/2026-06-01.pdf" as VaultPath);
      const planResult = await service.plan("daily", makeParameters({ folder: "src" }));
      expectOk(planResult);
      expect(planResult.value.notes.find((n) => n.path === "src/2026-06-01.pdf")).toBeUndefined();
    });

    it("skips a note whose date string cannot be parsed", async () => {
      const { service, notes, metadata } = build();
      notes.seed("src/2026-06-45.md" as VaultPath);
      metadata.setMetadata("src/2026-06-45.md" as VaultPath, {
        title: "2026-06-45",
        tags: [],
        properties: {},
        tasks: [],
      });
      const planResult = await service.plan("daily", makeParameters({ folder: "src" }));
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-45.md");
      expect(note?.kind === "skip" && note.reason).toBe("invalid-date");
    });

    it("skips a note whose date is outside the journal's timeline", async () => {
      const repo = fakeRepo({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { folder: "Journal", timeline: { start: anchor("2027-01-01"), end: { kind: "never" } } },
        ),
      });
      const notes = new FakeNotesService();
      const modals = new FakeModalService();
      const metadata = new FakeNoteMetadataService();

      const c = new Container();
      c.addModule(LoggerModule);
      c.register(JournalsRepository).useValue(repo);
      c.register(NotesService).useValue(notes as unknown as NotesService);
      c.register(ModalService).useValue(modals as unknown as ModalService);
      c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
      c.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
      c.register(JournalsIndex).useClass(JournalsIndex);
      c.register(CycleService).useClass(CycleService);
      c.register(NumberingService).useClass(NumberingService);
      c.register(FrontmatterService).useClass(FrontmatterService);
      c.register(TemplateContentService).useClass(TemplateContentService);
      c.register(TemplateEngine).useClass(TemplateEngine);
      c.register(NotePathService).useClass(NotePathService);
      c.register(SelfWriteGuard).useClass(SelfWriteGuard);
      c.register(NoteCreationService).useClass(NoteCreationService);
      c.register(NoteConnectionService).useClass(NoteConnectionService);
      c.register(TimelineService).useClass(TimelineService);
      c.register(BulkAddService).useClass(BulkAddService);

      const service = c.resolve(BulkAddService);
      notes.seed("src/2026-06-01.md" as VaultPath);
      metadata.setMetadata("src/2026-06-01.md" as VaultPath, {
        title: "2026-06-01",
        tags: [],
        properties: {},
        tasks: [],
      });
      const planResult = await service.plan("daily", makeParameters({ folder: "src" }));
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
      expect(note?.kind === "skip" && note.reason).toBe("out-of-bounds");
    });

    it("skips a property-dated note when the property is missing", async () => {
      const { service, notes, metadata } = build();
      notes.seed("src/2026-06-01.md" as VaultPath);
      metadata.setMetadata("src/2026-06-01.md" as VaultPath, {
        title: "x",
        tags: [],
        properties: {},
        tasks: [],
      });
      const planResult = await service.plan(
        "daily",
        makeParameters({ folder: "src", datePlace: "property", propertyName: "when" }),
      );
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
      expect(note?.kind === "skip" && note.reason).toBe("no-date");
    });

    it("marks the existing-note decision as ask when an occupant exists and params say ask", async () => {
      const { service, notes, metadata, index } = build();
      notes.seed("Journal/2026-06-01.md" as VaultPath, "", { journal: "daily", "journal-date": "2026-06-01" });
      index.register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });
      notes.seed("src/note.md" as VaultPath);
      metadata.setMetadata("src/note.md" as VaultPath, { title: "2026-06-01", tags: [], properties: {}, tasks: [] });
      const planResult = await service.plan("daily", makeParameters({ folder: "src", existingNote: "ask" }));
      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/note.md");
      expect(note?.kind === "action" && note.occupant).toBe("Journal/2026-06-01.md");
      expect(note?.kind === "action" && note.existing).toBe("ask");
    });
  });

  describe("resolve", () => {
    it("keeps the path and anchor from the planned action", () => {
      const { service } = build();
      const action = plannedAction({ path: "src/note.md" as VaultPath, anchor: anchor("2026-06-10") });
      const [resolved] = service.resolve([action], { existing: {}, folder: {}, name: {} });
      expect(resolved).toMatchObject({ path: "src/note.md", anchor: "2026-06-10" });
    });

    it("defaults an ask existing decision to skip when no choice was made", () => {
      const { service } = build();
      const action = plannedAction({ existing: "ask" });
      const [resolved] = service.resolve([action], { existing: {}, folder: {}, name: {} });
      expect(resolved?.existing).toBe("skip");
    });

    it("resolves an ask existing decision to the chosen value", () => {
      const { service } = build();
      const action = plannedAction({ path: "src/note.md" as VaultPath, existing: "ask" });
      const [resolved] = service.resolve([action], {
        existing: { "src/note.md": "merge" },
        folder: {},
        name: {},
      });
      expect(resolved?.existing).toBe("merge");
    });

    it("keeps a plan-decided existing value without consulting the decision map", () => {
      const { service } = build();
      const action = plannedAction({ path: "src/note.md" as VaultPath, existing: "override" });
      const [resolved] = service.resolve([action], {
        existing: { "src/note.md": "skip" },
        folder: {},
        name: {},
      });
      expect(resolved?.existing).toBe("override");
    });

    it("resolves an ask folder decision to move only when chosen", () => {
      const { service } = build();
      const action = plannedAction({ path: "src/note.md" as VaultPath, folder: "ask" });
      const [resolved] = service.resolve([action], {
        existing: {},
        folder: { "src/note.md": "move" },
        name: {},
      });
      expect(resolved?.move).toBe(true);
    });

    it("keeps a plan-decided move flag without consulting the folder decision map", () => {
      const { service } = build();
      const action = plannedAction({ path: "src/note.md" as VaultPath, folder: "move" });
      const [resolved] = service.resolve([action], {
        existing: {},
        folder: { "src/note.md": "keep" },
        name: {},
      });
      expect(resolved?.move).toBe(true);
    });

    it("resolves an ask name decision to rename only when chosen", () => {
      const { service } = build();
      const action = plannedAction({ path: "src/note.md" as VaultPath, name: "ask" });
      const [resolved] = service.resolve([action], {
        existing: {},
        folder: {},
        name: { "src/note.md": "rename" },
      });
      expect(resolved?.rename).toBe(true);
    });

    it("keeps a plan-decided rename flag without consulting the name decision map", () => {
      const { service } = build();
      const action = plannedAction({ path: "src/note.md" as VaultPath, name: "rename" });
      const [resolved] = service.resolve([action], {
        existing: {},
        folder: {},
        name: { "src/note.md": "keep" },
      });
      expect(resolved?.rename).toBe(true);
    });
  });

  describe("apply", () => {
    it("connects a note with move and rename when resolved that way", async () => {
      const { service, notes } = build();
      notes.seed("src/note.md" as VaultPath, "body");
      const logResult = await service.apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        false,
      );
      expectOk(logResult);
      const log = logResult.value;
      expect(notes.find("src/note.md" as VaultPath).isNone()).toBe(true);
      expect(notes.find("Journal/2026-06-01.md" as VaultPath).isSome()).toBe(true);
      expect(log[0]?.path).toBe("src/note.md");
    });

    it("reports progress after each note as it is applied", async () => {
      const { service, notes } = build();
      notes.seed("src/a.md" as VaultPath, "a");
      notes.seed("src/b.md" as VaultPath, "b");
      const progress: { done: number; total: number }[] = [];
      await service.apply(
        "daily",
        [
          { path: "src/a.md" as VaultPath, anchor: anchor("2026-06-01"), existing: "none", move: false, rename: false },
          { path: "src/b.md" as VaultPath, anchor: anchor("2026-06-02"), existing: "none", move: false, rename: false },
        ],
        true,
        (done, total) => progress.push({ done, total }),
      );
      expect(progress).toEqual([
        { done: 1, total: 2 },
        { done: 2, total: 2 },
      ]);
    });

    it("merges into the occupant and deletes the source", async () => {
      const { service, notes, index } = build();
      notes.seed("Journal/2026-06-01.md" as VaultPath, "OCCUPANT", {
        journal: "daily",
        "journal-date": "2026-06-01",
      });
      index.register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });
      notes.seed("src/note.md" as VaultPath, "SOURCE");
      await service.apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "merge",
            move: false,
            rename: false,
          },
        ],
        false,
      );
      expect(notes.find("src/note.md" as VaultPath).isNone()).toBe(true);
      const readResult = await notes.read("Journal/2026-06-01.md" as VaultPath);
      expectOk(readResult);
      expect(readResult.value).toContain("SOURCE");
    });

    it("performs no file changes in dry-run but still logs intended actions", async () => {
      const { service, notes } = build();
      notes.seed("src/note.md" as VaultPath, "body");
      const logResult = await service.apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        true,
      );
      expectOk(logResult);
      const log = logResult.value;
      expect(notes.find("src/note.md" as VaultPath).isSome()).toBe(true);
      expect(notes.find("Journal/2026-06-01.md" as VaultPath).isNone()).toBe(true);
      expect(log[0]?.actions.length).toBeGreaterThan(0);
    });

    it("reports the intended actions as data the caller can word for a dry run", async () => {
      const { service, notes } = build();
      notes.seed("src/note.md" as VaultPath, "body");
      const logResult = await service.apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        true,
      );
      expectOk(logResult);
      expect(logResult.value[0]?.actions).toEqual([
        { kind: "moved" },
        { kind: "renamed" },
        { kind: "connected", journalName: "daily", anchor: anchor("2026-06-01") },
      ]);
    });

    it("skips a note resolved as existing skip", async () => {
      const { service, notes } = build();
      notes.seed("src/note.md" as VaultPath, "body");
      await service.apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "skip",
            move: false,
            rename: false,
          },
        ],
        false,
      );
      expect(notes.find("src/note.md" as VaultPath).isSome()).toBe(true);
      expect(notes.find("Journal/2026-06-01.md" as VaultPath).isNone()).toBe(true);
    });

    it("records a per-note error without aborting the batch", async () => {
      const { service, notes } = build();
      notes.seed("src/ok.md" as VaultPath, "body");
      const logResult = await service.apply(
        "daily",
        [
          {
            path: "src/missing.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
          {
            path: "src/ok.md" as VaultPath,
            anchor: anchor("2026-06-02"),
            existing: "none",
            move: false,
            rename: false,
          },
        ],
        false,
      );
      expectOk(logResult);
      const log = logResult.value;
      expect(log).toHaveLength(2);
      expect(log[1]?.path).toBe("src/ok.md");
    });
  });
});
