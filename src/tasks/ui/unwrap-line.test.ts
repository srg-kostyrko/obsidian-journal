import { describe, expect, it } from "vitest";

import { unwrapLine } from "./unwrap-line";

describe("unwrapLine", () => {
  it("leaves a line that is already at the left margin untouched", () => {
    expect(unwrapLine("- [ ] Ship the tasks listing")).toBe("- [ ] Ship the tasks listing");
  });

  it("strips a tab-indented line's own indentation", () => {
    expect(unwrapLine("\t- [ ] Write the changelog entry")).toBe("- [ ] Write the changelog entry");
  });

  it("strips a space-indented line's own indentation", () => {
    expect(unwrapLine("    - [/] Re-read the manual")).toBe("- [/] Re-read the manual");
  });

  it("strips the blockquote marker a task inside a callout carries", () => {
    expect(unwrapLine("> - [ ] Send the sprint summary")).toBe("- [ ] Send the sprint summary");
  });

  it("strips every level of a nested blockquote", () => {
    expect(unwrapLine("> > - [ ] Quoted twice")).toBe("- [ ] Quoted twice");
  });

  it("strips a blockquote marker and the indentation behind it together", () => {
    expect(unwrapLine(">\t- [ ] Nested inside a callout")).toBe("- [ ] Nested inside a callout");
  });

  it("leaves an angle bracket inside the task's own text alone", () => {
    expect(unwrapLine("- [ ] Use > when quoting")).toBe("- [ ] Use > when quoting");
  });

  it("keeps a continuation indented relative to the line it belongs to", () => {
    expect(unwrapLine("\t- [ ] Parent\n\t\tcontinuation")).toBe("- [ ] Parent\n\tcontinuation");
  });

  it("keeps a quoted continuation indented relative to its own line", () => {
    expect(unwrapLine("> - [ ] Parent\n> \tcontinuation")).toBe("- [ ] Parent\n\tcontinuation");
  });

  it("strips by the first line's exact prefix, so mixed tabs and spaces are never re-measured", () => {
    expect(unwrapLine("\t - [ ] Parent\n\t \t deeper")).toBe("- [ ] Parent\n\t deeper");
  });

  it("leaves a line alone when it does not carry the first line's prefix", () => {
    expect(unwrapLine("\t- [ ] Parent\n  shallower")).toBe("- [ ] Parent\n  shallower");
  });

  it("leaves a blank line inside a multi-line item blank", () => {
    expect(unwrapLine("\t- [ ] Parent\n\n\t\ttail")).toBe("- [ ] Parent\n\n\ttail");
  });

  it("returns an empty string unchanged", () => {
    expect(unwrapLine("")).toBe("");
  });
});
