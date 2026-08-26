import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";

import { buildScannedNote } from "../testing";

import { checkRejectedAnchor } from "./rejected-anchor";

describe("checkRejectedAnchor", () => {
  it("passes a note whose stored date is already the period's anchor", () => {
    const result = checkRejectedAnchor(
      buildScannedNote({ storedAnchor: anchor("2026-01-12"), canonicalAnchor: anchor("2026-01-12") }),
    );

    expect(result).toBeUndefined();
  });

  it("passes a note claiming a journal that no longer exists", () => {
    const result = checkRejectedAnchor(buildScannedNote({ journalExists: false, rawDate: undefined }));

    expect(result).toBeUndefined();
  });

  it("repairs to the path's anchor when path and date agree", () => {
    const result = checkRejectedAnchor(
      buildScannedNote({
        storedAnchor: anchor("2026-01-14"),
        canonicalAnchor: anchor("2026-01-12"),
        pathAnchor: anchor("2026-01-12"),
      }),
    );

    expect(result?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
    expect(result?.detail).toEqual({ kind: "corroborated", from: anchor("2026-01-14"), to: anchor("2026-01-12") });
  });

  it("repairs to the date's own period when the path does not invert", () => {
    const result = checkRejectedAnchor(
      buildScannedNote({ storedAnchor: anchor("2026-01-14"), canonicalAnchor: anchor("2026-01-12") }),
    );

    expect(result?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
    expect(result?.detail.kind).toBe("date-only");
  });

  it("refuses to repair when the path and the date name different periods", () => {
    const result = checkRejectedAnchor(
      buildScannedNote({
        storedAnchor: anchor("2026-01-21"),
        canonicalAnchor: anchor("2026-01-19"),
        pathAnchor: anchor("2026-01-12"),
      }),
    );

    expect(result?.repair).toEqual({ kind: "undecidable", reason: "path-and-date-disagree" });
    expect(result?.detail).toEqual({
      kind: "path-overrides-date",
      pathAnchor: anchor("2026-01-12"),
      dateAnchor: anchor("2026-01-19"),
    });
  });

  it("repairs from the path when the date field holds nothing readable", () => {
    const result = checkRejectedAnchor(
      buildScannedNote({
        storedAnchor: undefined,
        canonicalAnchor: undefined,
        rawDate: "[[2026-01-12]]",
        pathAnchor: anchor("2026-01-12"),
      }),
    );

    expect(result?.repair).toEqual({ kind: "rewrite", anchor: anchor("2026-01-12") });
    expect(result?.detail).toEqual({ kind: "no-usable-date", raw: "[[2026-01-12]]", to: anchor("2026-01-12") });
  });

  it("gives up when neither the path nor the date yields an anchor", () => {
    const result = checkRejectedAnchor(
      buildScannedNote({ storedAnchor: undefined, canonicalAnchor: undefined, rawDate: undefined }),
    );

    expect(result?.repair).toEqual({ kind: "undecidable", reason: "path-not-invertible" });
    expect(result?.detail).toEqual({ kind: "unreadable", raw: undefined });
  });
});
