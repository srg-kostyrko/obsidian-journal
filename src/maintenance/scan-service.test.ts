import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { SettingsService } from "@/settings";
import { TemplateEngine } from "@/templates";

import { gateCollisions, orphanFindings, pendingOldIdsOf, ScanService } from "./scan-service";
import { ScannedNoteResolver } from "./scanned-note";

import type { Finding } from "./findings";
import type { ScannedNote } from "./scanned-note";

function note(path: string, overrides: Partial<ScannedNote> = {}): ScannedNote {
  return {
    path: path as VaultPath,
    claimedJournal: "weekly",
    journalExists: true,
    isDayJournal: false,
    size: 10,
    mtime: 1,
    rawDate: "2026-01-12",
    storedAnchor: anchor("2026-01-12"),
    canonicalAnchor: anchor("2026-01-12"),
    ...overrides,
  };
}

function rewrite(path: string, to: string): Finding {
  return {
    check: "rejected-anchor",
    path: path as VaultPath,
    journalName: "weekly",
    detail: { kind: "date-only", from: anchor("2026-01-14"), to: anchor(to) },
    repair: { kind: "rewrite", anchor: anchor(to) },
  };
}

describe("gateCollisions", () => {
  it("leaves an uncontested repair alone", () => {
    const notes = [note("a.md", { storedAnchor: anchor("2026-01-14"), canonicalAnchor: anchor("2026-01-12") })];
    const result = gateCollisions(notes, [rewrite("a.md", "2026-01-12")]);

    expect(result).toHaveLength(1);
    expect(result.at(0)?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("does not treat a repair that keeps its own anchor as a collision", () => {
    const notes = [note("a.md")];
    const result = gateCollisions(notes, [rewrite("a.md", "2026-01-12")]);

    expect(result.every((f) => f.check !== "duplicate-anchor")).toBe(true);
  });

  it("withdraws both repairs when two stranded notes project onto one anchor", () => {
    const notes = [
      note("a.md", { storedAnchor: anchor("2026-01-14"), canonicalAnchor: anchor("2026-01-12") }),
      note("b.md", { storedAnchor: anchor("2026-01-15"), canonicalAnchor: anchor("2026-01-12") }),
    ];
    const result = gateCollisions(notes, [rewrite("a.md", "2026-01-12"), rewrite("b.md", "2026-01-12")]);

    expect(result.filter((f) => f.check === "duplicate-anchor")).toHaveLength(2);
    expect(result.filter((f) => f.repair.kind === "rewrite")).toHaveLength(0);
    expect(
      result.filter((f) => f.repair.kind === "undecidable" && f.repair.reason === "anchor-contested"),
    ).toHaveLength(2);
  });

  it("withdraws a repair that would land on a healthy note's anchor", () => {
    const notes = [
      note("healthy.md"),
      note("stranded.md", { storedAnchor: anchor("2026-01-14"), canonicalAnchor: anchor("2026-01-12") }),
    ];
    const result = gateCollisions(notes, [rewrite("stranded.md", "2026-01-12")]);

    expect(
      result
        .filter((f) => f.check === "duplicate-anchor")
        .map((f) => f.path)
        .toSorted(),
    ).toEqual(["healthy.md", "stranded.md"]);
    expect(result.filter((f) => f.repair.kind === "rewrite")).toHaveLength(0);
  });

  it("reports a pre-existing duplicate between two healthy notes", () => {
    const result = gateCollisions([note("a.md"), note("b.md")], []);

    expect(result.filter((f) => f.check === "duplicate-anchor")).toHaveLength(2);
    expect(result.at(0)?.detail).toEqual({ kind: "duplicate", anchor: anchor("2026-01-12"), size: 10, mtime: 1 });
  });

  it("keeps journals apart", () => {
    const notes = [note("a.md"), note("b.md", { claimedJournal: "other" })];

    expect(gateCollisions(notes, []).filter((f) => f.check === "duplicate-anchor")).toHaveLength(0);
  });

  it("contributes nothing for an unhealthy note whose only finding is undecidable", () => {
    const notes = [
      note("target.md"),
      note("unplaced.md", { storedAnchor: anchor("2026-01-12"), canonicalAnchor: anchor("2026-01-20") }),
    ];
    const undecidable: Finding = {
      check: "rejected-anchor",
      path: "unplaced.md" as VaultPath,
      journalName: "weekly",
      detail: { kind: "path-overrides-date", pathAnchor: anchor("2026-01-20"), dateAnchor: anchor("2026-01-20") },
      repair: { kind: "undecidable", reason: "path-and-date-disagree" },
    };
    const result = gateCollisions(notes, [rewrite("target.md", "2026-01-12"), undecidable]);

    expect(result).toHaveLength(2);
    expect(result.filter((f) => f.check === "duplicate-anchor")).toHaveLength(0);
    expect(result.find((f) => f.path === "target.md")?.repair).toEqual({
      kind: "rewrite",
      anchor: anchor("2026-01-12"),
    });
    expect(result.find((f) => f.path === "unplaced.md")?.repair).toEqual({
      kind: "undecidable",
      reason: "path-and-date-disagree",
    });
  });
});

describe("orphanFindings", () => {
  it("reports a note whose journal no longer exists", () => {
    const notes = [note("old.md", { journalExists: false, claimedJournal: "gone" })];

    const result = orphanFindings(notes, new Set());

    expect(result).toHaveLength(1);
    expect(result.at(0)?.check).toBe("orphaned-claim");
    expect(result.at(0)?.journalName).toBe("gone");
    expect(result.at(0)?.repair).toEqual({ kind: "undecidable", reason: "needs-choice" });
  });

  it("never reports a note still waiting on the legacy note migration", () => {
    const notes = [note("legacy.md", { journalExists: false, claimedJournal: "legacy-id-7" })];

    expect(orphanFindings(notes, new Set(["legacy-id-7"]))).toHaveLength(0);
  });

  it("ignores notes whose journal exists", () => {
    expect(orphanFindings([note("fine.md")], new Set())).toHaveLength(0);
  });
});

describe("pendingOldIdsOf", () => {
  it("collects the old journal ids the note migration still has to rewrite", () => {
    const ids = pendingOldIdsOf([
      { kind: "interval", oldJournalId: "legacy-id-7", name: "Sprint" },
      { kind: "week-anchor", journalName: "weekly" },
    ]);

    expect([...ids]).toEqual(["legacy-id-7"]);
  });
});

function buildScan(journals: Record<string, JournalConfig>): {
  service: ScanService;
  index: JournalsIndex;
  notes: FakeNotesService;
  metadata: FakeNoteMetadataService;
  resolver: ScannedNoteResolver;
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
  c.register(SettingsService).useValue({ getSlice: () => ({ state: [] }) } as unknown as SettingsService);
  c.register(ScanService).useClass(ScanService);
  return {
    service: c.resolve(ScanService),
    index: c.resolve(JournalsIndex),
    notes,
    metadata,
    resolver: c.resolve(ScannedNoteResolver),
  };
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

describe("ScanService", () => {
  let teardown: () => void;
  beforeEach(() => {
    teardown = installTestCalendar({ dow: 1, doy: 4 }).teardown;
  });
  afterEach(() => {
    teardown();
  });

  it("waits for the index before reporting anything", async () => {
    const { service, index } = buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    let settled = false;
    const running = service.scan().then((report) => {
      settled = true;
      return report;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    index.markReady();
    const report = await running;
    expect(report.analysed).toBe(0);
  });

  it("counts notes it could not analyze", async () => {
    const { service, index, notes, metadata } = buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    seed(notes, metadata, "good.md", { journal: "weekly", "journal-date": "2026-01-12" });
    notes.seed("pending.md" as VaultPath, "", { journal: "weekly" });
    index.markReady();

    const report = await service.scan();

    expect(report.analysed).toBe(1);
    expect(report.unparsed).toBe(1);
    expect(report.findings).toHaveLength(0);
  });

  it("finds a stranded note and offers a repair", async () => {
    const { service, index, notes, metadata } = buildScan({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }),
    });
    seed(notes, metadata, "2026-W03.md", { journal: "weekly", "journal-date": "2026-01-14" });
    index.markReady();

    const report = await service.scan();

    expect(report.findings).toHaveLength(1);
    expect(report.findings.at(0)?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("reports a note whose resolution threw without losing the rest of the scan", async () => {
    const { service, index, notes, metadata, resolver } = buildScan({
      weekly: fixedJournal("weekly", { type: "week" }),
    });
    seed(notes, metadata, "good.md", { journal: "weekly", "journal-date": "2026-01-12" });
    seed(notes, metadata, "bad.md", { journal: "weekly", "journal-date": "2026-01-12" });
    vi.spyOn(resolver, "resolve").mockImplementationOnce(() => ({ kind: "unreadable", message: "boom" }));
    index.markReady();

    const report = await service.scan();

    expect(report.unreadable).toHaveLength(1);
    expect(report.analysed).toBe(1);
  });

  it("withdraws two rewrites that would land on the same anchor and reports the collision", async () => {
    const { service, index, notes, metadata } = buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    seed(notes, metadata, "a.md", { journal: "weekly", "journal-date": "2026-01-13" });
    seed(notes, metadata, "b.md", { journal: "weekly", "journal-date": "2026-01-14" });
    index.markReady();

    const report = await service.scan();

    expect(report.findings.filter((f) => f.check === "duplicate-anchor")).toHaveLength(2);
    expect(report.findings.some((f) => f.repair.kind === "rewrite")).toBe(false);
  });

  it("finds a note whose period range collapsed and offers a rewrite at its own anchor", async () => {
    const { service, index, notes, metadata } = buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    seed(notes, metadata, "2026-W03.md", {
      journal: "weekly",
      "journal-date": "2026-01-12",
      "journal-end-date": "2026-01-12",
    });
    index.markReady();

    const report = await service.scan();

    expect(report.findings).toHaveLength(1);
    expect(report.findings.at(0)?.check).toBe("stale-range");
    expect(report.findings.at(0)?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("stops using a stale path inverter after the journal's name template changes between scans", async () => {
    const weekly = fixedJournal("weekly", { type: "week" }, { nameTemplate: "Nope" });
    const { service, index, notes, metadata } = buildScan({ weekly });
    seed(notes, metadata, "2026-W03.md", { journal: "weekly", "journal-date": "not-a-date" });
    index.markReady();

    const first = await service.scan();
    expect(first.findings.at(0)?.repair).toEqual({ kind: "undecidable", reason: "path-not-invertible" });

    weekly.nameTemplate = "{{date:YYYY-[W]ww}}";
    const second = await service.scan();

    expect(second.findings.at(0)?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("reports a note whose journal no longer exists", async () => {
    const { service, index, notes, metadata } = buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    seed(notes, metadata, "old.md", { journal: "gone", "journal-date": "2026-01-12" });
    index.markReady();

    const report = await service.scan();

    expect(report.findings.filter((f) => f.check === "orphaned-claim")).toHaveLength(1);
    expect(report.findings.at(0)?.journalName).toBe("gone");
  });

  it("excludes notes with no journal claim and custom-journal notes from every counter", async () => {
    const { service, index, notes, metadata } = buildScan({
      weekly: fixedJournal("weekly", { type: "week" }),
      sprint: customJournal("sprint", "day", 14, "2026-01-05"),
    });
    seed(notes, metadata, "good.md", { journal: "weekly", "journal-date": "2026-01-12" });
    seed(notes, metadata, "Plain.md", { title: "hello" });
    seed(notes, metadata, "Sprints/1.md", { journal: "sprint", "journal-date": "2026-01-05" });
    index.markReady();

    const report = await service.scan();

    expect(report.analysed).toBe(1);
    expect(report.unparsed).toBe(0);
    expect(report.unreadable).toHaveLength(0);
  });
});
