import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { NoteMetadataService, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNotesService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import type { JournalConfig } from "@/journals/config";
import { CycleService } from "@/journals/cycle";
import { FrontmatterService } from "@/journals/frontmatter";
import { JournalsIndex } from "@/journals/journals-index";
import { NotePathService } from "@/journals/notes/note-path";
import { NumberingService } from "@/journals/numbering";
import { JournalsRepository } from "@/journals/repository";
import { customJournal, fakeRepo, fixedJournal } from "@/journals/testing";
import { TemplateEngine } from "@/templates";

import { ScannedNoteResolver } from "./scanned-note";

function build(journals: Record<string, JournalConfig>): {
  resolver: ScannedNoteResolver;
  notes: FakeNotesService;
  metadata: FakeNoteMetadataService;
} {
  const notes = new FakeNotesService();
  const metadata = new FakeNoteMetadataService();
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  c.register(ScannedNoteResolver).useClass(ScannedNoteResolver);
  return { resolver: c.resolve(ScannedNoteResolver), notes, metadata };
}

function seed(
  notes: FakeNotesService,
  metadata: FakeNoteMetadataService,
  path: string,
  frontmatter: Record<string, unknown>,
): void {
  notes.seed(path as VaultPath, "", frontmatter, { size: 100, mtime: 5 });
  metadata.setMetadata(path as VaultPath, { title: path, tags: [], properties: frontmatter, tasks: [] });
}

describe("ScannedNoteResolver", () => {
  let teardown: () => void;
  beforeEach(() => {
    teardown = installTestCalendar({ dow: 1, doy: 4 }).teardown;
  });
  afterEach(() => {
    teardown();
  });

  it("ignores a note that claims no journal", () => {
    const { resolver, notes, metadata } = build({ daily: fixedJournal("daily", { type: "day" }) });
    seed(notes, metadata, "Plain.md", { title: "hello" });

    expect(resolver.resolve("Plain.md" as VaultPath).kind).toBe("not-a-claim");
  });

  it("reports a note whose metadata has not been parsed yet", () => {
    const { resolver, notes } = build({ daily: fixedJournal("daily", { type: "day" }) });
    notes.seed("Unparsed.md" as VaultPath, "", { journal: "daily" });

    expect(resolver.resolve("Unparsed.md" as VaultPath).kind).toBe("unparsed");
  });

  it("skips a note belonging to a custom-interval journal", () => {
    const { resolver, notes, metadata } = build({
      sprint: customJournal("sprint", "day", 14, "2026-01-05"),
    });
    seed(notes, metadata, "Sprints/1.md", { journal: "sprint", "journal-date": "2026-01-05" });

    expect(resolver.resolve("Sprints/1.md" as VaultPath).kind).toBe("custom");
  });

  it("resolves a healthy note without inverting its path", () => {
    const { resolver, notes, metadata } = build({ weekly: fixedJournal("weekly", { type: "week" }) });
    seed(notes, metadata, "2026-W03.md", { journal: "weekly", "journal-date": "2026-01-12" });

    const outcome = resolver.resolve("2026-W03.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.storedAnchor).toBe(anchor("2026-01-12"));
    expect(outcome.note.canonicalAnchor).toBe(anchor("2026-01-12"));
    expect(outcome.note.pathAnchor).toBeUndefined();
  });

  it("inverts the path of a note whose stored date is not the period's anchor", () => {
    const { resolver, notes, metadata } = build({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }),
    });
    seed(notes, metadata, "2026-W03.md", { journal: "weekly", "journal-date": "2026-01-14" });

    const outcome = resolver.resolve("2026-W03.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.storedAnchor).toBe(anchor("2026-01-14"));
    expect(outcome.note.canonicalAnchor).toBe(anchor("2026-01-12"));
    expect(outcome.note.pathAnchor).toBe(anchor("2026-01-12"));
  });

  it("inverts the path of a note whose date field holds no readable date", () => {
    const { resolver, notes, metadata } = build({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }),
    });
    seed(notes, metadata, "2026-W03.md", { journal: "weekly", "journal-date": "[[2026-01-12]]" });

    const outcome = resolver.resolve("2026-W03.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.storedAnchor).toBeUndefined();
    expect(outcome.note.pathAnchor).toBe(anchor("2026-01-12"));
  });

  it("marks a note claiming a journal that no longer exists", () => {
    const { resolver, notes, metadata } = build({ weekly: fixedJournal("weekly", { type: "week" }) });
    seed(notes, metadata, "Old.md", { journal: "gone", "journal-date": "2026-01-12" });

    const outcome = resolver.resolve("Old.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.journalExists).toBe(false);
    expect(outcome.note.claimedJournal).toBe("gone");
  });
});
