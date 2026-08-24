import { describe, expect, it } from "vitest";

import { buildNavSegment } from "@/journals/testing";

import { applySegmentReorder } from "./line-reorder";

const a = buildNavSegment({ template: "a" });
const b = buildNavSegment({ template: "b" });
const c = buildNavSegment({ template: "c" });

describe("applySegmentReorder", () => {
  it("reorders within a line", () => {
    expect(applySegmentReorder([[a, b, c]], 0, ["0:2", "0:0", "0:1"])).toEqual([[c, a, b]]);
  });

  it("moves a segment into another line", () => {
    expect(applySegmentReorder([[a], [b, c]], 0, ["0:0", "1:1"])).toEqual([[a, c], [b]]);
  });

  it("removes a line emptied by dragging its last segment out", () => {
    expect(applySegmentReorder([[a], [b]], 0, ["0:0", "1:0"])).toEqual([[a, b]]);
  });

  it("splits a new line at the end", () => {
    expect(applySegmentReorder([[a, b]], 1, ["0:1"])).toEqual([[a], [b]]);
  });

  it("leaves the lines unchanged when the order is unchanged", () => {
    expect(applySegmentReorder([[a, b]], 0, ["0:0", "0:1"])).toEqual([[a, b]]);
  });

  it("drops a line that becomes empty in the middle", () => {
    expect(applySegmentReorder([[a], [b], [c]], 2, ["2:0", "1:0"])).toEqual([[a], [c, b]]);
  });

  it("inserts a new line into a gap without clobbering the line already there", () => {
    expect(applySegmentReorder([[a, b], [c]], 1, ["0:0"])).toEqual([[b], [a], [c]]);
  });

  it("is a no-op when orderedIds is empty", () => {
    expect(applySegmentReorder([[a, b]], 0, [])).toEqual([[a, b]]);
  });

  it("skips an id whose segment no longer exists", () => {
    expect(applySegmentReorder([[a, b]], 0, ["0:0", "9:9", "0:1"])).toEqual([[a, b]]);
  });

  it("clamps a targetLine past the end to a new line at the end", () => {
    expect(applySegmentReorder([[a, b]], 5, ["0:1"])).toEqual([[a], [b]]);
  });
});
