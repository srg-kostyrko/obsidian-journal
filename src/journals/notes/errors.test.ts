import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { isBenignFlowError } from "@/infrastructure/flows";

import { NoApplicableJournals } from "./errors";

describe("NoApplicableJournals", () => {
  it("is treated as a benign flow error", () => {
    expect(isBenignFlowError(new NoApplicableJournals(anchor("2026-07-01")))).toBe(true);
  });
});
