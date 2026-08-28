import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { Bindings, BoundValue } from "@/templates";

import { PROMPT_PLACEHOLDER } from "./placeholder";
import { answersFromBindings, parseSpecFor, renderSpecFor } from "./prompt-binding";

import type { Prompt } from "./config";

const dated: Prompt = { variable: "m", question: "?", type: "date", frontmatterKey: "m", required: true };
const counted: Prompt = { variable: "n", question: "?", type: "number", frontmatterKey: "n", required: true };
const free: Prompt = { variable: "note", question: "?", type: "text", frontmatterKey: "note", required: false };
const mood: Prompt = {
  variable: "mood",
  question: "?",
  type: "select",
  frontmatterKey: "mood",
  required: true,
  options: [
    { label: "开心", value: "😀" },
    { label: "平静", value: "😶" },
  ],
};

describe("renderSpecFor", () => {
  it("binds a date answer as a date spec so formats and shifts work", () => {
    expect(renderSpecFor(dated, "2026-08-28", "YYYY-MM-DD")).toEqual({
      kind: "date",
      value: CalendarDate.fromAnchor(anchor("2026-08-28")),
      defaultFormat: "YYYY-MM-DD",
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });

  it("binds a number answer as a number spec so offsets work", () => {
    expect(renderSpecFor(counted, 7, "YYYY-MM-DD")).toEqual({
      kind: "number",
      value: 7,
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });

  it("falls back to the placeholder string when unanswered", () => {
    expect(renderSpecFor(dated, undefined, "YYYY-MM-DD")).toEqual({
      kind: "string",
      value: PROMPT_PLACEHOLDER,
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });

  it("falls back to the placeholder when a date answer does not parse", () => {
    expect(renderSpecFor(dated, "not a date", "YYYY-MM-DD")).toEqual({
      kind: "string",
      value: PROMPT_PLACEHOLDER,
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });

  it("falls back to the placeholder when a number prompt holds a non-number answer", () => {
    expect(renderSpecFor(counted, "seven", "YYYY-MM-DD")).toEqual({
      kind: "string",
      value: PROMPT_PLACEHOLDER,
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });

  it("binds a select answer as a string beside its own values", () => {
    expect(renderSpecFor(mood, "😀", "YYYY-MM-DD")).toEqual({
      kind: "string",
      value: "😀",
      alternatives: [PROMPT_PLACEHOLDER, "😀", "😶"],
    });
  });
});

describe("parseSpecFor", () => {
  it("offers a select's own values as alternatives", () => {
    expect(parseSpecFor(mood, "YYYY-MM-DD")).toEqual({
      kind: "string",
      value: PROMPT_PLACEHOLDER,
      alternatives: [PROMPT_PLACEHOLDER, "😀", "😶"],
    });
  });

  it("matches only the placeholder for free text", () => {
    expect(parseSpecFor(free, "YYYY-MM-DD")).toEqual({
      kind: "string",
      value: PROMPT_PLACEHOLDER,
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });

  it("matches the journal's date format for a date prompt", () => {
    const spec = parseSpecFor(dated, "YYYY-MM-DD");
    expect(spec.kind).toBe("date");
    expect(spec.kind === "date" && spec.defaultFormat).toBe("YYYY-MM-DD");
    expect("alternatives" in spec && spec.alternatives).toEqual([PROMPT_PLACEHOLDER]);
  });

  it("matches a number for a number prompt", () => {
    expect(parseSpecFor(counted, "YYYY-MM-DD")).toEqual({
      kind: "number",
      value: 0,
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });
});

const bind = (entries: [string, BoundValue][]): Bindings => new Map(entries);

describe("answersFromBindings", () => {
  it("recovers a select answer as a string", () => {
    expect(answersFromBindings([mood], bind([["mood", { kind: "string", value: "😀" }]]))).toEqual({ mood: "😀" });
  });

  it("recovers a number answer", () => {
    expect(answersFromBindings([counted], bind([["n", { kind: "number", value: 7 }]]))).toEqual({ n: 7 });
  });

  it("recovers a date answer as an anchor string", () => {
    const bindings = bind([["m", { kind: "date", value: CalendarDate.fromAnchor(anchor("2026-08-28")) }]]);
    expect(answersFromBindings([dated], bindings)).toEqual({ m: "2026-08-28" });
  });

  it("treats the placeholder as no answer", () => {
    expect(answersFromBindings([mood], bind([["mood", { kind: "string", value: PROMPT_PLACEHOLDER }]]))).toEqual({});
  });

  it("skips a prompt the path never bound", () => {
    expect(answersFromBindings([mood, counted], bind([["mood", { kind: "string", value: "😶" }]]))).toEqual({
      mood: "😶",
    });
  });
});
