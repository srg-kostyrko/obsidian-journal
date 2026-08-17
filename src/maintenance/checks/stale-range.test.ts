import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";

import { checkStaleRange } from "./stale-range";

import type { ScannedNote } from "../scanned-note";

function note(overrides: Partial<ScannedNote>): ScannedNote {
  return {
    path: "W03.md" as VaultPath,
    claimedJournal: "weekly",
    journalExists: true,
    isDayJournal: false,
    size: 0,
    mtime: 0,
    rawDate: "2026-01-12",
    storedAnchor: anchor("2026-01-12"),
    canonicalAnchor: anchor("2026-01-12"),
    expectedStart: anchor("2026-01-12"),
    ...overrides,
  };
}

describe("checkStaleRange", () => {
  it("passes a note whose range matches its period", () => {
    expect(checkStaleRange(note({ storedStart: "2026-01-12", storedEnd: "2026-01-18" }))).toBeUndefined();
  });

  it("flags a period that ends on the day it starts", () => {
    const result = checkStaleRange(note({ storedEnd: "2026-01-12" }));

    expect(result?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
    expect(result?.detail).toEqual({ kind: "zero-length-range", anchor: anchor("2026-01-12") });
  });

  it("leaves a one-day period alone on a day journal", () => {
    expect(checkStaleRange(note({ isDayJournal: true, storedEnd: "2026-01-12" }))).toBeUndefined();
  });

  it("leaves a deliberately extended period alone", () => {
    expect(checkStaleRange(note({ storedEnd: "2026-02-28" }))).toBeUndefined();
  });

  it("flags a start date that is not the period's start", () => {
    const result = checkStaleRange(note({ storedStart: "2026-01-14" }));

    expect(result?.detail).toEqual({
      kind: "start-mismatch",
      anchor: anchor("2026-01-12"),
      storedStart: "2026-01-14",
      expectedStart: anchor("2026-01-12"),
    });
    expect(result?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("ignores a note that is already reported as rejected", () => {
    const result = checkStaleRange(
      note({ storedAnchor: anchor("2026-01-14"), canonicalAnchor: anchor("2026-01-12"), storedEnd: "2026-01-14" }),
    );

    expect(result).toBeUndefined();
  });
});
