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
  it("inside a quote, indent is measured after the quote prefix", () => {
    const lines = ["> - [ ] Parent", ">   - [ ] Child", ">", ">   - more", "> - [ ] Sibling"];
    expect(subtreeEnd(lines, 0)).toBe(3);
    expect(subtreeEnd(lines, 4)).toBe(4);
  });
  it("a quote ending ends the subtree", () => {
    expect(subtreeEnd(["> - [ ] Parent", ">   - [ ] Child", "", "    - [ ] after"], 0)).toBe(1);
    expect(subtreeEnd(["> - [ ] Parent", ">   - [ ] Child", "    - [ ] lazy"], 0)).toBe(1);
  });
  it("a line at another quote depth is not part of the subtree", () => {
    expect(subtreeEnd(["> - [ ] Parent", ">>   - [ ] deeper", ">   - [ ] child"], 0)).toBe(0);
    expect(subtreeEnd(["- [ ] Parent", ">   - [ ] quoted", "    - [ ] child"], 0)).toBe(0);
  });
});

describe("ancestorsOf", () => {
  it("ancestorsOf returns the chain nearest last", () => {
    const lines = ["Intro", "- [ ] top", "    - [ ] sibling", "    - [ ] middle", "        - [ ] leaf"];
    expect(ancestorsOf(lines, 4)).toEqual([1, 3]);
  });
  it("walks a quoted list by the indent after the quote prefix", () => {
    const lines = ["> - [ ] top", ">   - [ ] middle", ">", ">     - [ ] leaf"];
    expect(ancestorsOf(lines, 3)).toEqual([0, 1]);
  });
  it("stops where the quote begins or ends", () => {
    expect(ancestorsOf(["- [ ] outside", "    > - [ ] quoted"], 1)).toEqual([0]);
    expect(ancestorsOf(["- [ ] outside", ">   - [ ] quoted"], 1)).toEqual([]);
    expect(ancestorsOf(["> - [ ] quoted", "", "    - [ ] outside"], 2)).toEqual([]);
    expect(ancestorsOf(["> - [ ] earlier quote", "", ">   - [ ] later quote"], 2)).toEqual([]);
  });
  it("stops at a paragraph at indent 0", () => {
    const lines = ["- [ ] other list", "Paragraph", "    - [ ] indented"];
    expect(ancestorsOf(lines, 2)).toEqual([]);
  });
});
