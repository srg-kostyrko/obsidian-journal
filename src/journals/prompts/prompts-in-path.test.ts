import { describe, expect, it } from "vitest";

import { PROMPT_PLACEHOLDER } from "./placeholder";
import { promptsInPath } from "./prompts-in-path";

import type { Prompt } from "./config";

const mood: Prompt = { variable: "mood", question: "?", type: "text", frontmatterKey: "mood", required: false };
const project: Prompt = { variable: "project", question: "?", type: "text", frontmatterKey: "p", required: false };

describe("promptsInPath", () => {
  it("finds a prompt used in the name template", () => {
    const owner = { nameTemplate: "{{date}} {{mood}}", folder: "", prompts: [mood, project] };
    expect(promptsInPath(owner)).toEqual([mood]);
  });

  it("finds a prompt used only in the folder", () => {
    const owner = { nameTemplate: "{{date}}", folder: "Journal/{{project}}", prompts: [mood, project] };
    expect(promptsInPath(owner)).toEqual([project]);
  });

  it("matches case-insensitively, because the context lookup does", () => {
    const owner = { nameTemplate: "{{date}} {{Mood}}", folder: "", prompts: [mood] };
    expect(promptsInPath(owner)).toEqual([mood]);
  });

  it("is empty when no prompt reaches the path", () => {
    const owner = { nameTemplate: "{{date}}", folder: "Journal", prompts: [mood, project] };
    expect(promptsInPath(owner)).toEqual([]);
  });

  it("ignores a prompt named inside a literal", () => {
    const owner = { nameTemplate: "{{date:[mood]}}", folder: "", prompts: [mood] };
    expect(promptsInPath(owner)).toEqual([]);
  });
});

describe("PROMPT_PLACEHOLDER", () => {
  it("contains no character Obsidian forbids in a file name or a link", () => {
    expect(PROMPT_PLACEHOLDER).not.toMatch(/[*"\\/<>:|?#^[\]]/);
  });

  it("neither starts nor ends with a dot or a space", () => {
    expect(PROMPT_PLACEHOLDER).not.toMatch(/^[. ]|[. ]$/);
  });

  it("is inert as markdown even when two are adjacent", () => {
    const doubled = PROMPT_PLACEHOLDER + PROMPT_PLACEHOLDER;
    expect(doubled).not.toMatch(/__|~~|\*\*|%%|``/);
  });
});
