import { describe, expect, it } from "vitest";

import { rewriteSource, stampLine } from "./source-write";

import type { PlannedRoot } from "./plan";

function root(line: number, end: number, firstLine: string): PlannedRoot {
  return { line, end, firstLine, heading: null, hasBlockId: false };
}

describe("stampLine", () => {
  it("the stamp goes before a trailing block id", () => {
    expect(stampLine("- [ ] a ^abc", "#rolled")).toBe("- [ ] a #rolled ^abc");
  });
  it("appends the stamp to a line with no block id", () => {
    expect(stampLine("- [ ] a", "#rolled")).toBe("- [ ] a #rolled");
  });
  it("leaves a caret inside the text alone", () => {
    expect(stampLine("- [ ] 2^10 is big", "#rolled")).toBe("- [ ] 2^10 is big #rolled");
  });
});

describe("rewriteSource", () => {
  const content = ["# Day", "- [ ] a", "    - [ ] a child", "- [ ] b", "- [ ] c"].join("\n");
  const roots = [root(1, 2, "- [ ] a"), root(4, 4, "- [ ] c")];

  it("stamps each root's first line only", () => {
    expect(rewriteSource(content, roots, { kind: "stamp", marker: "#rolled" })).toEqual({
      content: ["# Day", "- [ ] a #rolled", "    - [ ] a child", "- [ ] b", "- [ ] c #rolled"].join("\n"),
    });
  });

  it("a line inserted above a root refuses the whole rewrite", () => {
    const drifted = ["# Day", "- [ ] a", "    - [ ] a child", "- [ ] new", "- [ ] b", "- [ ] c"].join("\n");
    expect(rewriteSource(drifted, roots, { kind: "stamp", marker: "#rolled" })).toEqual({ reason: "changed" });
    expect(rewriteSource(drifted, roots, { kind: "remove" })).toEqual({ reason: "changed" });
  });

  it("a child removed from a root's subtree refuses a remove", () => {
    const shrunk = ["# Day", "- [ ] a", "- [ ] b", "- [ ] c"].join("\n");
    expect(rewriteSource(shrunk, [root(1, 2, "- [ ] a")], { kind: "remove" })).toEqual({ reason: "changed" });
  });

  it("remove deletes each subtree and keeps context ancestors", () => {
    const nested = ["- [x] Shopping", "    - [ ] milk", "        - note", "    - [x] bread", "- [ ] other"].join("\n");
    expect(rewriteSource(nested, [root(1, 2, "    - [ ] milk")], { kind: "remove" })).toEqual({
      content: ["- [x] Shopping", "    - [x] bread", "- [ ] other"].join("\n"),
    });
  });
});
