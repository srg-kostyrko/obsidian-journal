import { describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import type { JournalConfig } from "@/journals/config";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { customJournal, fixedJournal } from "@/journals/testing";
import { legacyMigrationsModule, pendingNoteMigrationSlice } from "@/settings/legacy";
import { testContainer, type FakeHost } from "@/testing";

import { maintenanceCoreModule } from "./module";
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

async function buildScan(journals: Record<string, JournalConfig>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, maintenanceCoreModule, legacyMigrationsModule],
    // ScanService reads the pending-migration slice, and legacyMigrationsModule is what
    // registers it — a seed without the key parses as a slice reset rather than an empty list.
    data: { journals, [pendingNoteMigrationSlice.key]: [] },
  });
  return {
    host: harness.host,
    service: harness.resolve(ScanService),
    index: harness.resolve(JournalsIndex),
    repository: harness.resolve(JournalsRepository),
    resolver: harness.resolve(ScannedNoteResolver),
  };
}

// A file in the vault that Obsidian has not parsed yet. getFileCache answers null until the
// metadataCache resolves it, which is what the resolver reads as "unparsed".
function leaveUnparsed(host: FakeHost, path: string): void {
  const cache = host.app.metadataCache;
  const parsed = cache.getFileCache.bind(cache);
  vi.spyOn(cache, "getFileCache").mockImplementation((file) => (file.path === path ? null : parsed(file)));
}

describe("ScanService", () => {
  it("waits for the index before reporting anything", async () => {
    const { service, index } = await buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    let settled = false;
    const running = service.scan().then((report) => {
      settled = true;
      return report;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    index.markReady();
    const report = await running;
    expect(report.analyzed).toBe(0);
  });

  it("counts notes it could not analyze", async () => {
    const { service, index, host } = await buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    host.putFile("good.md", "", { journal: "weekly", "journal-date": "2026-01-12" });
    host.putFile("pending.md", "", { journal: "weekly" });
    leaveUnparsed(host, "pending.md");
    index.markReady();

    const report = await service.scan();

    expect(report.analyzed).toBe(1);
    expect(report.unparsed).toBe(1);
    expect(report.findings).toHaveLength(0);
  });

  it("finds a stranded note and offers a repair", async () => {
    const { service, index, host } = await buildScan({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }),
    });
    host.putFile("2026-W03.md", "", { journal: "weekly", "journal-date": "2026-01-14" });
    index.markReady();

    const report = await service.scan();

    expect(report.findings).toHaveLength(1);
    expect(report.findings.at(0)?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("reports a note whose resolution threw without losing the rest of the scan", async () => {
    const { service, index, host, resolver } = await buildScan({
      weekly: fixedJournal("weekly", { type: "week" }),
    });
    host.putFile("good.md", "", { journal: "weekly", "journal-date": "2026-01-12" });
    host.putFile("bad.md", "", { journal: "weekly", "journal-date": "2026-01-12" });
    vi.spyOn(resolver, "resolve").mockImplementationOnce(() => ({ kind: "unreadable", message: "boom" }));
    index.markReady();

    const report = await service.scan();

    expect(report.unreadable).toHaveLength(1);
    expect(report.analyzed).toBe(1);
  });

  it("withdraws two rewrites that would land on the same anchor and reports the collision", async () => {
    const { service, index, host } = await buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    host.putFile("a.md", "", { journal: "weekly", "journal-date": "2026-01-13" });
    host.putFile("b.md", "", { journal: "weekly", "journal-date": "2026-01-14" });
    index.markReady();

    const report = await service.scan();

    expect(report.findings.filter((f) => f.check === "duplicate-anchor")).toHaveLength(2);
    expect(report.findings.some((f) => f.repair.kind === "rewrite")).toBe(false);
  });

  it("finds a note whose period range collapsed and offers a rewrite at its own anchor", async () => {
    const { service, index, host } = await buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    host.putFile("2026-W03.md", "", {
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
    const { service, index, host, repository } = await buildScan({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "Nope" }),
    });
    host.putFile("2026-W03.md", "", { journal: "weekly", "journal-date": "not-a-date" });
    index.markReady();

    const first = await service.scan();
    expect(first.findings.at(0)?.repair).toEqual({ kind: "undecidable", reason: "path-not-invertible" });

    repository.update("weekly", { nameTemplate: "{{date:YYYY-[W]ww}}" });
    const second = await service.scan();

    expect(second.findings.at(0)?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("reports a note whose journal no longer exists", async () => {
    const { service, index, host } = await buildScan({ weekly: fixedJournal("weekly", { type: "week" }) });
    host.putFile("old.md", "", { journal: "gone", "journal-date": "2026-01-12" });
    index.markReady();

    const report = await service.scan();

    expect(report.findings.filter((f) => f.check === "orphaned-claim")).toHaveLength(1);
    expect(report.findings.at(0)?.journalName).toBe("gone");
  });

  it("excludes notes with no journal claim and custom-journal notes from every counter", async () => {
    const { service, index, host } = await buildScan({
      weekly: fixedJournal("weekly", { type: "week" }),
      sprint: customJournal("sprint", "day", 14, "2026-01-05"),
    });
    host.putFile("good.md", "", { journal: "weekly", "journal-date": "2026-01-12" });
    host.putFile("Plain.md", "", { title: "hello" });
    host.putFile("Sprints/1.md", "", { journal: "sprint", "journal-date": "2026-01-05" });
    index.markReady();

    const report = await service.scan();

    expect(report.analyzed).toBe(1);
    expect(report.unparsed).toBe(0);
    expect(report.unreadable).toHaveLength(0);
  });
});
