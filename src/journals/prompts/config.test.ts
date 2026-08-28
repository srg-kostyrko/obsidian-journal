import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { promptsSchema } from "./config";

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
});
