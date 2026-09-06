import { describe, expect, it } from "vitest";

import { buildScannedNote } from "../testing";

import { checkOrphanedType } from "./orphaned-type";

describe("checkOrphanedType", () => {
  it("reports a notelet whose type is gone, offering strip-claim", () => {
    const finding = checkOrphanedType(buildScannedNote({ noteletTypeName: "Retired", noteletTypeExists: false }));

    expect(finding).toMatchObject({
      check: "orphaned-type",
      detail: { kind: "orphaned-type", typeName: "Retired" },
      repair: { kind: "strip-claim" },
    });
  });

  it("says nothing about a notelet whose type exists", () => {
    expect(
      checkOrphanedType(buildScannedNote({ noteletTypeName: "Standup", noteletTypeExists: true })),
    ).toBeUndefined();
  });

  it("says nothing about a period note", () => {
    expect(checkOrphanedType(buildScannedNote({}))).toBeUndefined();
  });

  it("says nothing when the journal itself is gone — that is orphaned-claim's finding", () => {
    expect(checkOrphanedType(buildScannedNote({ journalExists: false, noteletTypeName: "Retired" }))).toBeUndefined();
  });
});
