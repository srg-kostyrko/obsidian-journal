import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { buildCheckboxRuleFormSchema, checkboxRuleConditionErrors } from "./rule-form-schema";

describe("checkboxRuleConditionErrors", () => {
  it("flags a tag condition with no tags", () => {
    const errors = checkboxRuleConditionErrors({
      mode: "and",
      conditions: [{ type: "tag", condition: "has", tags: [] }],
    });
    expect(errors.get(0)).toBeTruthy();
  });

  it("flags a heading condition with no headings", () => {
    const errors = checkboxRuleConditionErrors({
      mode: "and",
      conditions: [{ type: "heading", condition: "under", headings: [] }],
    });
    expect(errors.get(0)).toBeTruthy();
  });

  it("reports no error for a condition with at least one value", () => {
    const errors = checkboxRuleConditionErrors({
      mode: "and",
      conditions: [{ type: "tag", condition: "has", tags: ["#work"] }],
    });
    expect(errors.size).toBe(0);
  });

  it("reports no error for an empty condition list", () => {
    const errors = checkboxRuleConditionErrors({ mode: "and", conditions: [] });
    expect(errors.size).toBe(0);
  });

  it("keys errors by the offending condition's index, not the first one found", () => {
    const errors = checkboxRuleConditionErrors({
      mode: "and",
      conditions: [
        { type: "tag", condition: "has", tags: ["#work"] },
        { type: "heading", condition: "under", headings: [] },
      ],
    });
    expect(errors.has(0)).toBe(false);
    expect(errors.get(1)).toBeTruthy();
  });

  // Storage stays permissive: the slice/journal schema round-trips an empty condition rather
  // than discarding the whole rule or entity on load. This is what stops a future contributor
  // from "simplifying" by tightening checkboxRuleSchema/checkboxJournalRuleSchema to match the
  // form's minLength — that would turn one legacy empty condition into a wholesale slice reset.
  it("still accepts an empty condition through the storage schema, unlike the form schema", async () => {
    const { checkboxRuleSchema } = await import("./rule-schema");
    const stored = {
      mode: "and" as const,
      conditions: [{ type: "tag" as const, condition: "has" as const, tags: [] }],
    };

    expect(v.safeParse(checkboxRuleSchema, stored).success).toBe(true);
    expect(v.safeParse(buildCheckboxRuleFormSchema(), stored).success).toBe(false);
  });
});
