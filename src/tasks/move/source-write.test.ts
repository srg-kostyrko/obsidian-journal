import { describe, expect, it } from "vitest";

import { rewriteSource, stampLine } from "./source-write";

import type { PlannedRoot } from "./plan";

function root(content: string, line: number, end: number): PlannedRoot {
  const lines = content.split("\n").slice(line, end + 1);
  return { line, end, firstLine: lines.at(0) ?? "", lines, heading: null, hasBlockId: false };
}

describe("stampLine", () => {
  it("the stamp goes before a trailing block id", () => {
    expect(stampLine("- [ ] a ^abc", "#rolled")).toBe("- [ ] a #rolled ^abc");
  });
  it("appends the stamp to a line with no block id", () => {
    expect(stampLine("- [ ] a", "#rolled")).toBe("- [ ] a #rolled");
  });
  it("keeps a CRLF line's carriage return last", () => {
    expect(stampLine("- [ ] a\r", "#rolled")).toBe("- [ ] a #rolled\r");
    expect(stampLine("- [ ] a ^abc\r", "#rolled")).toBe("- [ ] a #rolled ^abc\r");
  });
  it("keeps a two-space hard break last", () => {
    expect(stampLine("- [ ] a  ", "#rolled")).toBe("- [ ] a #rolled  ");
  });
  it("leaves a caret inside the text alone", () => {
    expect(stampLine("- [ ] 2^10 is big", "#rolled")).toBe("- [ ] 2^10 is big #rolled");
  });
});

describe("rewriteSource", () => {
  const content = ["# Day", "- [ ] a", "    - [ ] a child", "- [ ] b", "- [ ] c"].join("\n");
  const roots = [root(content, 1, 2), root(content, 4, 4)];

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
    expect(rewriteSource(shrunk, [root(content, 1, 2)], { kind: "remove" })).toEqual({ reason: "changed" });
  });

  it("a child edited after planning refuses the rewrite", () => {
    const edited = ["# Day", "- [ ] a", "    - [x] a child", "- [ ] b", "- [ ] c"].join("\n");
    expect(rewriteSource(edited, roots, { kind: "remove" })).toEqual({ reason: "changed" });
    expect(rewriteSource(edited, roots, { kind: "stamp", marker: "#rolled" })).toEqual({ reason: "changed" });
  });

  it("overlapping or repeated roots refuse the rewrite", () => {
    const outer = root(content, 1, 2);
    const inner = { ...root(content, 2, 2), end: 2 };
    expect(rewriteSource(content, [outer, outer], { kind: "remove" })).toEqual({ reason: "changed" });
    expect(rewriteSource(content, [inner, outer], { kind: "stamp", marker: "#rolled" })).toEqual({ reason: "changed" });
  });

  it("a root planned on the editor's LF text applies to a CRLF file and keeps its line endings", () => {
    const crlf = content.replaceAll("\n", "\r\n");
    expect(rewriteSource(crlf, roots, { kind: "stamp", marker: "#rolled" })).toEqual({
      content: ["# Day", "- [ ] a #rolled", "    - [ ] a child", "- [ ] b", "- [ ] c #rolled"].join("\r\n"),
    });
    expect(rewriteSource(crlf, roots, { kind: "remove" })).toEqual({ content: "# Day\r\n- [ ] b" });
    const drifted = ["# Day", "- [ ] a", "    - [x] a child", "- [ ] b", "- [ ] c"].join("\r\n");
    expect(rewriteSource(drifted, roots, { kind: "remove" })).toEqual({ reason: "changed" });
  });

  it("remove deletes each subtree and keeps context ancestors", () => {
    const nested = ["- [x] Shopping", "    - [ ] milk", "        - note", "    - [x] bread", "- [ ] other"].join("\n");
    expect(rewriteSource(nested, [root(nested, 1, 2)], { kind: "remove" })).toEqual({
      content: ["- [x] Shopping", "    - [x] bread", "- [ ] other"].join("\n"),
    });
  });
});
