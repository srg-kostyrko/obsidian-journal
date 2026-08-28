import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { Bindings, BoundValue } from "@/templates";

import { PROMPT_PLACEHOLDER } from "./placeholder";
import { answersFromBindings, parseSpecFor, renderBindingFor } from "./prompt-binding";

import type { Prompt } from "./config";

const dated: Prompt = {
  variable: "m",
  question: "?",
  type: "date",
  frontmatterKey: "m",
  required: true,
  format: "YYYY-MM-DD",
};
const counted: Prompt = { variable: "n", question: "?", type: "number", frontmatterKey: "n", required: true };
const flagged: Prompt = { variable: "done", question: "?", type: "toggle", frontmatterKey: "done", required: false };
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

describe("renderBindingFor", () => {
  it("binds a date answer as a date spec so formats and shifts work", () => {
    expect(renderBindingFor(dated, "2026-08-28")).toEqual({
      spec: {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2026-08-28")),
        defaultFormat: "YYYY-MM-DD",
        alternatives: [PROMPT_PLACEHOLDER],
      },
      answered: true,
    });
  });

  it("binds a date answer using the prompt's own custom format, not a passed-in one", () => {
    const custom: Prompt = { ...dated, format: "DD/MM/YYYY" };
    expect(renderBindingFor(custom, "2026-08-28")).toEqual({
      spec: {
        kind: "date",
        value: CalendarDate.fromAnchor(anchor("2026-08-28")),
        defaultFormat: "DD/MM/YYYY",
        alternatives: [PROMPT_PLACEHOLDER],
      },
      answered: true,
    });
  });

  it("binds a number answer as a number spec so offsets work", () => {
    expect(renderBindingFor(counted, 7)).toEqual({
      spec: { kind: "number", value: 7, alternatives: [PROMPT_PLACEHOLDER] },
      answered: true,
    });
  });

  it("falls back to the placeholder when unanswered", () => {
    expect(renderBindingFor(dated, undefined)).toEqual({
      spec: { kind: "string", value: PROMPT_PLACEHOLDER, alternatives: [PROMPT_PLACEHOLDER] },
      answered: false,
    });
  });

  it("reports a date answer that does not parse as unanswered", () => {
    expect(renderBindingFor(dated, "not a date")).toEqual({
      spec: { kind: "string", value: PROMPT_PLACEHOLDER, alternatives: [PROMPT_PLACEHOLDER] },
      answered: false,
    });
  });

  it("reports a number prompt holding a non-number answer as unanswered", () => {
    expect(renderBindingFor(counted, "seven")).toEqual({
      spec: { kind: "string", value: PROMPT_PLACEHOLDER, alternatives: [PROMPT_PLACEHOLDER] },
      answered: false,
    });
  });

  it("binds a select answer as a string beside its own values", () => {
    expect(renderBindingFor(mood, "😀")).toEqual({
      spec: { kind: "string", value: "😀", alternatives: [PROMPT_PLACEHOLDER, "😀", "😶"] },
      answered: true,
    });
  });

  it("binds a yes/no answer as words, never as a raw boolean", () => {
    expect(renderBindingFor(flagged, true)).toEqual({
      spec: { kind: "string", value: m.common_yes(), alternatives: [PROMPT_PLACEHOLDER] },
      answered: true,
    });
    expect(renderBindingFor(flagged, false)).toEqual({
      spec: { kind: "string", value: m.common_no(), alternatives: [PROMPT_PLACEHOLDER] },
      answered: true,
    });
  });
});

describe("parseSpecFor", () => {
  it("offers a select's own values as alternatives", () => {
    expect(parseSpecFor(mood)).toEqual({
      kind: "string",
      value: PROMPT_PLACEHOLDER,
      alternatives: [PROMPT_PLACEHOLDER, "😀", "😶"],
    });
  });

  it("matches only the placeholder for free text", () => {
    expect(parseSpecFor(free)).toEqual({
      kind: "string",
      value: PROMPT_PLACEHOLDER,
      alternatives: [PROMPT_PLACEHOLDER],
    });
  });

  it("matches the prompt's own format for a date prompt", () => {
    const spec = parseSpecFor(dated);
    expect(spec.kind).toBe("date");
    expect(spec.kind === "date" && spec.defaultFormat).toBe("YYYY-MM-DD");
    expect("alternatives" in spec && spec.alternatives).toEqual([PROMPT_PLACEHOLDER]);
  });

  it("matches a number for a number prompt", () => {
    expect(parseSpecFor(counted)).toEqual({
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
