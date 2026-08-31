import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";

import { buildScannedNote } from "../testing";

import { checkStaleRange } from "./stale-range";

describe("checkStaleRange", () => {
  it("passes a note whose range matches its period", () => {
    expect(checkStaleRange(buildScannedNote({ storedStart: "2026-01-12", storedEnd: "2026-01-18" }))).toBeUndefined();
  });

  it("flags a period that ends on the day it starts", () => {
    const result = checkStaleRange(buildScannedNote({ storedEnd: "2026-01-12" }));

    expect(result?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
    expect(result?.detail).toEqual({ kind: "zero-length-range", anchor: anchor("2026-01-12") });
  });

  it("leaves a one-day period alone on a day journal", () => {
    expect(checkStaleRange(buildScannedNote({ isDayJournal: true, storedEnd: "2026-01-12" }))).toBeUndefined();
  });

  it("leaves a deliberately extended period alone", () => {
    expect(checkStaleRange(buildScannedNote({ storedEnd: "2026-02-28" }))).toBeUndefined();
  });

  it("flags a start date that is not the period's start", () => {
    const result = checkStaleRange(buildScannedNote({ storedStart: "2026-01-14" }));

    expect(result?.detail).toEqual({
      kind: "start-mismatch",
      anchor: anchor("2026-01-12"),
      storedStart: "2026-01-14",
      expectedStart: anchor("2026-01-12"),
    });
    expect(result?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
  });

  it("never fires for a notelet, which has no start or end keys to go stale", () => {
    expect(
      checkStaleRange(buildScannedNote({ noteletTypeName: "Standup", storedEnd: anchor("2026-01-12") })),
    ).toBeUndefined();
  });

  it("ignores a note that is already reported as rejected", () => {
    const result = checkStaleRange(
      buildScannedNote({
        storedAnchor: anchor("2026-01-14"),
        canonicalAnchor: anchor("2026-01-12"),
        storedEnd: "2026-01-14",
      }),
    );

    expect(result).toBeUndefined();
  });
});
