import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { isBenignFlowError, isUserFacingFlowError } from "@/infrastructure/flows";

import { NoApplicableJournals, NotePathClaimedError } from "./errors";

describe("NoApplicableJournals", () => {
  it("is treated as a benign flow error", () => {
    expect(isBenignFlowError(new NoApplicableJournals(anchor("2026-07-01")))).toBe(true);
  });
});

describe("NotePathClaimedError", () => {
  it("carries a notice naming both journals and the path", () => {
    const error = new NotePathClaimedError("daily", "Journal/2026-05-19.md", "logbook");

    expect(isUserFacingFlowError(error)).toBe(true);
    expect(error.userNotice).toContain("daily");
    expect(error.userNotice).toContain("logbook");
    expect(error.userNotice).toContain("Journal/2026-05-19.md");
  });
});
