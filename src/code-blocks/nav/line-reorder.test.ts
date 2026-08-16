import { describe, expect, it } from "vitest";

import type { NavBlockSegment } from "@/journals";

import { applySegmentReorder } from "./line-reorder";

function segment(template: string): NavBlockSegment {
  return {
    template,
    fontSize: 1,
    bold: false,
    italic: false,
    color: { type: "theme", name: "text-normal" },
    background: { type: "transparent" },
    link: "none",
    journal: "",
    linkDate: "",
    addDecorations: false,
  };
}

const a = segment("a");
const b = segment("b");
const c = segment("c");

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

  // Not in the brief: the given Step-3 sketch only ever appends a fresh line at the very
  // end (targetLine === lines.length) or overwrites an existing line whose full content is
  // already reflected in orderedIds (a join). Dropping into a gap strictly between two
  // untouched lines needs a genuine insert, or the line already sitting at that index gets
  // clobbered. This is the case the brief's own "mid-list line drop" warning points at.
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
