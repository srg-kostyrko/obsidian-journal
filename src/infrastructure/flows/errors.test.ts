import { describe, expect, it } from "vitest";

import { isBenignFlowError, UserAborted, type BenignFlowError } from "./errors";

describe("UserAborted", () => {
  it("exposes the source field", () => {
    expect(new UserAborted("journal-picker").source).toBe("journal-picker");
  });

  it("includes the source in the error message", () => {
    expect(new UserAborted("journal-picker").message).toBe("User aborted at journal-picker");
  });

  it("uses 'user-aborted' as its kind discriminant", () => {
    expect(new UserAborted("journal-picker").kind).toBe("user-aborted");
  });
});

class MarkedError extends Error implements BenignFlowError {
  readonly benign = true as const;
}

describe("isBenignFlowError", () => {
  it("returns true for an error implementing BenignFlowError", () => {
    expect(isBenignFlowError(new MarkedError())).toBe(true);
  });

  it("returns false for an error without the benign marker", () => {
    expect(isBenignFlowError(new UserAborted("journal-picker"))).toBe(false);
  });
});
