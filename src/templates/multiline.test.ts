import { describe, expect, it } from "vitest";

import { continueMultiline, lineEndingOf, normalizeMultiline } from "./multiline";

describe("lineEndingOf", () => {
  it("reads CRLF when the text has any", () => {
    expect(lineEndingOf("a\r\nb")).toBe("\r\n");
  });

  it("reads LF otherwise, including text with no line break", () => {
    expect(lineEndingOf("a\nb")).toBe("\n");
    expect(lineEndingOf("a")).toBe("\n");
  });
});

describe("normalizeMultiline", () => {
  it("converts CRLF and CR to LF", () => {
    expect(normalizeMultiline("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("drops leading and trailing blank lines but keeps a first line's own indentation", () => {
    expect(normalizeMultiline("\n  \n  a\nb\n \n")).toBe("  a\nb");
  });

  it("keeps trailing spaces on a line that has no line break after it", () => {
    expect(normalizeMultiline("a  ")).toBe("a  ");
  });
});

describe("continueMultiline", () => {
  const eol = "\n";
  const indent = " ".repeat(4);

  it.each([
    ["no structure", "Mood: ", "a\nb\n\n\nc", "a\nb\n\nc"],
    ["a quote", "> ", "a\nb\n\nc", "a\n> b\n>\n> c"],
    ["a nested quote", ">> ", "a\nb\n\nc", "a\n>> b\n>>\n>> c"],
    ["indentation", indent, "a\nb\n\nc", `a\n${indent}b\n\n${indent}c`],
    ["text after the quote marker", "> Challenge: ", "a\nb", "a\n> b"],
    ["a bullet", "- ", "a\nb\n\nc", "a\n  b\n- c"],
    ["another bullet character", "* ", "a\n\nb", "a\n* b"],
    ["an ordered item, counting up", "3. ", "a\nb\n\nc\n\nd", "a\n   b\n4. c\n5. d"],
    ["a parenthesised ordered item", "1) ", "a\n\nb", "a\n2) b"],
    [
      "a task",
      "- [ ] ",
      "Call Anna\nabout the lease\n\nBook the dentist",
      "Call Anna\n      about the lease\n- [ ] Book the dentist",
    ],
    ["a checked task, repeated as written", "- [x] ", "a\n\nb", "a\n- [x] b"],
    ["a list inside a quote", "> - ", "a\nb\n\nc", "a\n>   b\n> - c"],
    ["an indented list item", "  - ", "a\nb\n\nc", "a\n    b\n  - c"],
    ["several blank lines as one break in a list", "- ", "a\n\n\n\nb", "a\n- b"],
    ["a whitespace-only line as a break", "- ", "a\n  \nb", "a\n- b"],
  ])("continues under %s", (_label, lineSoFar, value, expected) => {
    expect(continueMultiline(value, lineSoFar, eol)).toBe(expected);
  });

  it("returns a value that trims to one line unchanged by structure", () => {
    expect(continueMultiline("\na\n\n", "- ", eol)).toBe("a");
  });

  it("does not read a hyphen without a following space as a list marker", () => {
    expect(continueMultiline("a\nb", "-5 ", eol)).toBe("a\nb");
  });

  it("normalizes the value's own CRLF before continuing", () => {
    expect(continueMultiline("a\r\nb", "> ", eol)).toBe("a\n> b");
  });

  it("writes the given line ending", () => {
    expect(continueMultiline("a\nb\n\nc", "> ", "\r\n")).toBe("a\r\n> b\r\n>\r\n> c");
  });

  it("uses indentation only when markdown structure does not apply", () => {
    expect(continueMultiline("a\nb", "  > - ", eol, false)).toBe("a\n  b");
  });
});
