import { describe, expect, it } from "vitest";

import { toNavSegmentFlowError, UnknownNavSegmentError, NavSegmentLifecycleFlowError } from "./errors";

describe("toNavSegmentFlowError", () => {
  it("wraps an UnknownNavSegmentError in a NavSegmentLifecycleFlowError carrying the cause", () => {
    const cause = new UnknownNavSegmentError("daily", 3);
    const wrapped = toNavSegmentFlowError(cause);
    expect(wrapped).toBeInstanceOf(NavSegmentLifecycleFlowError);
    expect(wrapped.cause).toBe(cause);
  });
});
