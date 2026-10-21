import { describe, expect, it } from "vitest";

import { ancestorsOf, indentOf, subtreeEnd } from "./subtree";

describe("indentOf", () => {
  it("counts a tab as four columns", () => {
    expect(indentOf("\t- [ ] a")).toBe(4);
    expect(indentOf("  - [ ] a")).toBe(2);
  });
});

describe("subtreeEnd", () => {
  it("a non-task child bullet belongs to the subtree", () => {
    expect(subtreeEnd(["- [ ] A", "    - note", "- [ ] B"], 0)).toBe(1);
  });
  it("a blank line followed by a sibling ends the subtree", () => {
    expect(subtreeEnd(["- [ ] A", "    - [ ] child", "", "- [ ] B"], 0)).toBe(1);
  });
  it("a blank line followed by a deeper line stays inside the subtree", () => {
    expect(subtreeEnd(["- [ ] A", "    - [ ] child", "", "    - [ ] more", "- [ ] B"], 0)).toBe(3);
  });
});

describe("ancestorsOf", () => {
  it("ancestorsOf returns the chain nearest last", () => {
    const lines = ["Intro", "- [ ] top", "    - [ ] sibling", "    - [ ] middle", "        - [ ] leaf"];
    expect(ancestorsOf(lines, 4)).toEqual([1, 3]);
  });
  it("stops at a paragraph at indent 0", () => {
    const lines = ["- [ ] other list", "Paragraph", "    - [ ] indented"];
    expect(ancestorsOf(lines, 2)).toEqual([]);
  });
});
