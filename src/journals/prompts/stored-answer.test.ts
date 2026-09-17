import { describe, expect, it } from "vitest";

import { readStoredAnswer, storedValueOf } from "./stored-answer";

import type { Prompt } from "./config";

const note: Prompt = { variable: "project", question: "?", type: "note", frontmatterKey: "project", required: false };
const text: Prompt = { variable: "mood", question: "?", type: "text", frontmatterKey: "mood", required: false };

describe("storedValueOf", () => {
  it("stores a note link as a one-item list", () => {
    expect(storedValueOf(note, "[[Roadmap]]")).toEqual(["[[Roadmap]]"]);
  });

  it("stores any other answer as it is", () => {
    expect(storedValueOf(text, "great")).toBe("great");
  });
});

describe("readStoredAnswer", () => {
  it("reads a one-item list holding a link", () => {
    expect(readStoredAnswer(note, ["[[Roadmap]]"])).toBe("[[Roadmap]]");
  });

  it("reads a link typed as a plain property value", () => {
    expect(readStoredAnswer(note, "[[Roadmap]]")).toBe("[[Roadmap]]");
  });

  it.each([
    ["a list of two links", ["[[Roadmap]]", "[[Budget]]"]],
    ["an empty list", []],
    ["a list holding plain text", ["Roadmap"]],
    ["plain text", "Roadmap"],
    ["empty brackets", "[[]]"],
    ["a number", 3],
  ])("reads %s as no answer to a note link question", (_, value) => {
    expect(readStoredAnswer(note, value)).toBeUndefined();
  });

  it.each([
    ["text", "great"],
    ["a number", 3],
    ["a boolean", true],
  ])("reads %s as the answer to any other question", (_, value) => {
    expect(readStoredAnswer(text, value)).toBe(value);
  });

  it("reads a list as no answer to any other question", () => {
    expect(readStoredAnswer(text, ["great"])).toBeUndefined();
  });
});
