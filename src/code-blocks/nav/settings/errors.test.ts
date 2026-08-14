import { describe, expect, it } from "vitest";

import { toNavRowFlowError, UnknownNavRowError, NavRowLifecycleFlowError } from "./errors";

describe("toNavRowFlowError", () => {
  it("wraps an UnknownNavRowError in a NavRowLifecycleFlowError carrying the cause", () => {
    const cause = new UnknownNavRowError("daily", 3);
    const wrapped = toNavRowFlowError(cause);
    expect(wrapped).toBeInstanceOf(NavRowLifecycleFlowError);
    expect(wrapped.cause).toBe(cause);
  });
});
