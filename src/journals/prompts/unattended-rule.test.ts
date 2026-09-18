import { describe, expect, it } from "vitest";

import { unattendedOutcome } from "./unattended-rule";

import type { Prompt } from "./config";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

describe("unattendedOutcome", () => {
  it("proceeds when the journal has no prompts", () => {
    expect(unattendedOutcome({ nameTemplate: "{{date}}", folder: "", prompts: [] })).toEqual({ kind: "proceed" });
  });

  it("refuses with in-path when a prompt reaches the note name", () => {
    const owner = { nameTemplate: "{{date}} {{mood}}", folder: "", prompts: [mood] };
    expect(unattendedOutcome(owner)).toEqual({ kind: "refuse", reason: "in-path" });
  });

  it("refuses with required when a required prompt has no key and is out of the path", () => {
    const required: Prompt = { ...mood, frontmatterKey: "", required: true };
    const owner = { nameTemplate: "{{date}}", folder: "", prompts: [required] };
    expect(unattendedOutcome(owner)).toEqual({ kind: "refuse", reason: "required" });
  });

  it("proceeds when every prompt is optional and out of the path", () => {
    const owner = { nameTemplate: "{{date}}", folder: "", prompts: [mood] };
    expect(unattendedOutcome(owner)).toEqual({ kind: "proceed" });
  });

  it("prefers in-path over required when both apply", () => {
    const required: Prompt = { ...mood, required: true };
    const owner = { nameTemplate: "{{date}} {{mood}}", folder: "", prompts: [required] };
    expect(unattendedOutcome(owner)).toEqual({ kind: "refuse", reason: "in-path" });
  });

  it("proceeds when the answer the note name uses is supplied", () => {
    const owner = { nameTemplate: "{{date}} {{mood}}", folder: "", prompts: [mood] };
    expect(unattendedOutcome(owner, { mood: "good" })).toEqual({ kind: "proceed" });
  });

  it("proceeds when a required question is answered", () => {
    const owner = { nameTemplate: "{{date}}", folder: "", prompts: [{ ...mood, required: true }] };
    expect(unattendedOutcome(owner, { mood: "good" })).toEqual({ kind: "proceed" });
  });

  it("still refuses when only a different question is answered", () => {
    const sleep: Prompt = { ...mood, variable: "sleep", frontmatterKey: "sleep" };
    const owner = { nameTemplate: "{{date}} {{mood}}", folder: "", prompts: [mood, sleep] };
    expect(unattendedOutcome(owner, { sleep: "8" })).toEqual({ kind: "refuse", reason: "in-path" });
  });

  it("still refuses required when only a different question is answered", () => {
    const sleep: Prompt = { ...mood, variable: "sleep", frontmatterKey: "sleep" };
    const owner = { nameTemplate: "{{date}}", folder: "", prompts: [{ ...mood, required: true }, sleep] };
    expect(unattendedOutcome(owner, { sleep: "8" })).toEqual({ kind: "refuse", reason: "required" });
  });
});
