import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";

import { gateCollisions, orphanFindings, pendingOldIdsOf } from "./scan-service";

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
