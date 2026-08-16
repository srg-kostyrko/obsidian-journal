import { describe, expect, it } from "vitest";

import { toNavSegmentFlowError, UnknownNavSegmentError, NavSegmentLifecycleFlowError } from "./errors";

describe("toNavSegmentFlowError", () => {
  it("wraps an UnknownNavSegmentError in a NavSegmentLifecycleFlowError carrying the cause", () => {
    const cause = new UnknownNavSegmentError("daily", "segment", 3);
    const wrapped = toNavSegmentFlowError(cause);
    expect(wrapped).toBeInstanceOf(NavSegmentLifecycleFlowError);
    expect(wrapped.cause).toBe(cause);
  });
});

describe("UnknownNavSegmentError", () => {
  it("names the line, not the segment, when a line index is out of range", () => {
    const error = new UnknownNavSegmentError("daily", "line", 5);
    expect(error.target).toBe("line");
    expect(error.message).toBe("Nav block line not found: journal=daily index=5");
  });

  it("names the segment, not the line, when a segment index is out of range", () => {
    const error = new UnknownNavSegmentError("daily", "segment", 2);
    expect(error.target).toBe("segment");
    expect(error.message).toBe("Nav block segment not found: journal=daily index=2");
  });
});
