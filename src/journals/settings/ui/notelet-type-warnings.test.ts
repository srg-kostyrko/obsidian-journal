import { describe, expect, it } from "vitest";

import { hasNoWithinPeriodVariable, rendersOntoPeriodNotePath } from "./notelet-type-warnings";

import type { Prompt } from "../../prompts/config";

function prompt(overrides: Partial<Extract<Prompt, { type: "text" }>> = {}): Prompt {
  return { variable: "topic", question: "?", type: "text", frontmatterKey: "topic", required: false, ...overrides };
}

describe("hasNoWithinPeriodVariable", () => {
  it("is true for a name template with no clock token, counter or question", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{journal_name}}", prompts: [] })).toBe(true);
  });

  it("is false for the shipped default template, which carries the counter", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{journal_name}} {{notelet_index}}", prompts: [] })).toBe(false);
  });

  it("is false when the counter is present", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{journal_name}} {{notelet_index}}", prompts: [] })).toBe(false);
  });

  it("is false when one of the type's own questions reaches the name", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{topic}}", prompts: [prompt({ variable: "topic" })] })).toBe(
      false,
    );
  });

  it("is false when a clock token is present", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{time}}", prompts: [] })).toBe(false);
  });

  it("is false when the current_time clock token is present", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{current_time}}", prompts: [] })).toBe(false);
  });

  it("ignores a question that belongs to another type", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{topic}}", prompts: [] })).toBe(true);
  });

  it("is true for current_date, a date-kind variable that varies within a period but is not in the enumerated set", () => {
    expect(hasNoWithinPeriodVariable({ nameTemplate: "{{current_date}}", prompts: [] })).toBe(true);
  });
});

describe("rendersOntoPeriodNotePath", () => {
  it("is true when folder, date format and journal-name-substituted template all match", () => {
    expect(
      rendersOntoPeriodNotePath(
        { name: "daily", nameTemplate: "{{date}}", folder: "notes", dateFormat: "YYYY-MM-DD" },
        { nameTemplate: "{{date}}", folder: "notes" },
      ),
    ).toBe(true);
  });

  it("is false when the folders differ", () => {
    expect(
      rendersOntoPeriodNotePath(
        { name: "daily", nameTemplate: "{{date}}", folder: "notes", dateFormat: "YYYY-MM-DD" },
        { nameTemplate: "{{date}}", folder: "meetings" },
      ),
    ).toBe(false);
  });

  it("is false when the name templates differ", () => {
    expect(
      rendersOntoPeriodNotePath(
        { name: "daily", nameTemplate: "{{date}}", folder: "notes", dateFormat: "YYYY-MM-DD" },
        { nameTemplate: "{{date}} {{notelet_index}}", folder: "notes" },
      ),
    ).toBe(false);
  });

  it("substitutes journal_name in both templates before comparing", () => {
    expect(
      rendersOntoPeriodNotePath(
        { name: "Work", nameTemplate: "{{journal_name}} {{date}}", folder: "", dateFormat: "YYYY-MM-DD" },
        { nameTemplate: "Work {{date}}", folder: "" },
      ),
    ).toBe(true);
  });
});
