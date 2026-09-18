import { describe, expect, it } from "vitest";

import { readAnswerInput, type LinkTextResolver } from "./answer-input";
import { PROMPT_PLACEHOLDER } from "./placeholder";

import type { Prompt } from "./config";
import type { PromptOwner } from "./prompts-in-path";

const base = { frontmatterKey: "", required: false } as const;
const mood: Prompt = { ...base, variable: "mood", question: "Mood?", type: "text" };
const diary: Prompt = { ...base, variable: "diary", question: "Diary", type: "text", multiline: true };
const hours: Prompt = { ...base, variable: "hours", question: "Hours?", type: "number" };
const due: Prompt = { ...base, variable: "due", question: "Due?", type: "date", format: "DD.MM.YYYY" };
const done: Prompt = { variable: "done", question: "Done?", type: "toggle", frontmatterKey: "" };
const place: Prompt = {
  ...base,
  variable: "place",
  question: "Where?",
  type: "select",
  options: [
    { label: "Home", value: "home" },
    { label: "Office", value: "office" },
  ],
};
const who: Prompt = { ...base, variable: "who", question: "Who?", type: "note" };

function owner(prompts: Prompt[], nameTemplate = "{{date}}"): PromptOwner {
  return { nameTemplate, folder: "", prompts };
}

const files: Record<string, string> = { "People/Ann.md": "Ann", "Odd/a#b.md": "a#b" };
const linkTextFor: LinkTextResolver = (path) => files[path];

function read(prompts: Prompt[], input: Record<string, unknown>, nameTemplate?: string) {
  return readAnswerInput(owner(prompts, nameTemplate), input, linkTextFor);
}

function issuesOf(prompts: Prompt[], input: Record<string, unknown>, nameTemplate?: string) {
  const result = read(prompts, input, nameTemplate);
  return result.isErr() ? result.error : [];
}

describe("readAnswerInput", () => {
  it("accepts one valid answer of every type", () => {
    const result = read([mood, diary, hours, due, done, place, who], {
      mood: "good",
      diary: "line one\nline two",
      hours: 0,
      due: "2026-09-01",
      done: false,
      place: "office",
      who: "People/Ann.md",
    });

    expect(result.isOk() && result.value).toEqual({
      mood: "good",
      diary: "line one\nline two",
      hours: 0,
      due: "2026-09-01",
      done: false,
      place: "office",
      who: "[[Ann]]",
    });
  });

  it("leaves blank, null and absent answers out", () => {
    const result = read([mood, hours, place], { mood: "  ", hours: null, place: "" });

    expect(result.isOk() && result.value).toEqual({});
  });

  it("rejects a variable no question uses", () => {
    expect(issuesOf([mood], { mod: "good" })).toEqual([{ variable: "mod", reason: expect.any(String) as string }]);
  });

  // An inherited key must not read as an answer: `constructor` is on every object's prototype.
  it("does not read a question's answer off the prototype", () => {
    const ctor: Prompt = { ...mood, variable: "constructor", required: true };

    expect(issuesOf([ctor], {})).toEqual([{ variable: "constructor", reason: expect.any(String) as string }]);
  });

  // `answers[variable] = …` on a plain object hits the inherited prototype setter for this name
  // instead of creating an own property, silently dropping the answer.
  it("keeps an answer to a question whose variable is __proto__", () => {
    const reservedNameQuestion: Prompt = { ...mood, variable: "__proto__" };

    // Computed key syntax is load-bearing: `{ __proto__: "x" }` sets the object's prototype
    // instead of creating an own property, and would make this test pass for the wrong reason.
    const result = read([reservedNameQuestion], { ["__proto__"]: "x" });

    expect(result.isOk()).toBe(true);
    const value = result.isOk() ? result.value : {};
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(value, "__proto__")).toMatchObject({ value: "x" });
  });

  // A getter runs arbitrary code the caller does not control, so it is rejected rather than read.
  it("rejects a getter in place of a plain answer", () => {
    const input: Record<string, unknown> = {};
    Object.defineProperty(input, "mood", { get: () => "good", enumerable: true, configurable: true });

    expect(issuesOf([mood], input)).toEqual([{ variable: "mood", reason: expect.any(String) as string }]);
  });

  it("requires an answer to a required question", () => {
    expect(issuesOf([{ ...mood, required: true }], {})).toEqual([
      { variable: "mood", reason: expect.any(String) as string },
    ]);
  });

  it("requires an answer the note name uses, even on an optional question", () => {
    expect(issuesOf([mood], {}, "{{date}} {{mood}}")).toEqual([
      { variable: "mood", reason: expect.any(String) as string },
    ]);
  });

  it("reports every issue in one pass", () => {
    const issues = issuesOf([{ ...mood, required: true }, hours, place], { hours: "3", place: "moon", typo: 1 });

    expect(issues.map((issue) => issue.variable).toSorted()).toEqual(["hours", "mood", "place", "typo"]);
  });

  describe("text", () => {
    it("rejects a non-string", () => {
      expect(issuesOf([mood], { mood: 5 })).toHaveLength(1);
    });

    it("rejects a line break in a single-line question", () => {
      expect(issuesOf([mood], { mood: "a\nb" })).toHaveLength(1);
    });

    it("rejects the unanswered placeholder as an answer", () => {
      expect(issuesOf([mood], { mood: PROMPT_PLACEHOLDER })).toHaveLength(1);
    });
  });

  describe("number", () => {
    it.each([["3"], [NaN], [Infinity]])("rejects %s", (value) => {
      expect(issuesOf([hours], { hours: value })).toHaveLength(1);
    });
  });

  describe("date", () => {
    it.each([["01.09.2026"], ["2026-02-30"], ["today"], [20_260_901]])("rejects %s", (value) => {
      expect(issuesOf([due], { due: value })).toHaveLength(1);
    });
  });

  describe("toggle", () => {
    it("rejects a non-boolean", () => {
      expect(issuesOf([done], { done: "yes" })).toHaveLength(1);
    });
  });

  describe("select", () => {
    it("rejects a label in place of a value", () => {
      expect(issuesOf([place], { place: "Office" })).toHaveLength(1);
    });
  });

  describe("note", () => {
    it("rejects a path with no file", () => {
      expect(issuesOf([who], { who: "People/Bob.md" })).toHaveLength(1);
    });

    it("rejects a file whose name a link cannot carry", () => {
      expect(issuesOf([who], { who: "Odd/a#b.md" })).toHaveLength(1);
    });
  });
});
