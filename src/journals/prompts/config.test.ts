import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { isRequired, promptsSchema } from "./config";

import type { Prompt } from "./config";

describe("promptsSchema", () => {
  const text = { variable: "mood", question: "How was today?", type: "text" };

  it("applies defaults for frontmatterKey and required", () => {
    const parsed = v.safeParse(promptsSchema, [text]);
    expect(parsed.success && parsed.output[0]).toEqual({
      variable: "mood",
      question: "How was today?",
      type: "text",
      frontmatterKey: "",
      required: false,
    });
  });

  // A yes/no answer always has one of its two values, so "required" can never refuse it. The
  // flag is off the toggle variant entirely, which means a stored one is dropped on read
  // rather than left behind to keep refusing unattended creation with no control to clear it.
  it("drops a stored required flag from a yes/no prompt", () => {
    const parsed = v.safeParse(promptsSchema, [{ ...text, type: "toggle", required: true }]);
    expect(parsed.success && parsed.output[0]).toEqual({
      variable: "mood",
      question: "How was today?",
      type: "toggle",
      frontmatterKey: "",
    });
  });

  it("requires at least one option on a select prompt", () => {
    expect(v.safeParse(promptsSchema, [{ ...text, type: "select", options: [] }]).success).toBe(false);
  });

  it("accepts label/value option pairs", () => {
    const parsed = v.safeParse(promptsSchema, [{ ...text, type: "select", options: [{ label: "开心", value: "😀" }] }]);
    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate variables", () => {
    expect(v.safeParse(promptsSchema, [text, { ...text, question: "Again?" }]).success).toBe(false);
  });

  it("rejects duplicate non-empty frontmatter keys", () => {
    const a = { ...text, frontmatterKey: "mood" };
    const b = { ...text, variable: "energy", frontmatterKey: "mood" };
    expect(v.safeParse(promptsSchema, [a, b]).success).toBe(false);
  });

  it("allows several prompts to share the empty frontmatter key", () => {
    const a = { ...text, frontmatterKey: "" };
    const b = { ...text, variable: "energy", frontmatterKey: "" };
    expect(v.safeParse(promptsSchema, [a, b]).success).toBe(true);
  });

  it("reports a bad field with a path so the repair can find it", () => {
    const parsed = v.safeParse(promptsSchema, [{ ...text, variable: "" }]);
    expect(parsed.success).toBe(false);
    expect(parsed.issues?.[0]?.path?.map((p) => p.key)).toEqual([0, "variable"]);
  });

  describe("a date prompt's format", () => {
    const dated = { ...text, type: "date" };

    it("defaults to YYYY-MM-DD when the stored prompt has no format key", () => {
      const parsed = v.safeParse(promptsSchema, [dated]);
      expect(parsed.success && parsed.output[0]).toMatchObject({ type: "date", format: "YYYY-MM-DD" });
    });

    it("keeps a custom format", () => {
      const parsed = v.safeParse(promptsSchema, [{ ...dated, format: "DD/MM/YYYY" }]);
      expect(parsed.success && parsed.output[0]).toMatchObject({ type: "date", format: "DD/MM/YYYY" });
    });

    it("accepts an empty format rather than failing validation", () => {
      // No minLength on purpose: a validation issue under `prompts` makes
      // repairCollectionEntry substitute the whole array with `[]`, wiping every question.
      const parsed = v.safeParse(promptsSchema, [{ ...dated, format: "" }]);
      expect(parsed.success).toBe(true);
    });
  });
});

describe("isRequired", () => {
  const done: Prompt = { variable: "done", question: "Done?", type: "toggle", frontmatterKey: "done" };

  it("is true for a question marked required", () => {
    expect(isRequired({ ...done, type: "text", required: true })).toBe(true);
  });

  it("is false for a question left optional", () => {
    expect(isRequired({ ...done, type: "text", required: false })).toBe(false);
  });

  it("is false for a yes/no question even when the stored object still carries the flag", () => {
    expect(isRequired({ ...done, required: true } as Prompt)).toBe(false);
  });
});
