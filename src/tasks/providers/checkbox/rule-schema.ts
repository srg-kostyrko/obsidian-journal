// Leaf on purpose: journalConfigSchema imports this file, and the tasks module imports
// journals — any further import here would close a cycle.
import * as v from "valibot";

export const checkboxConditionSchema = v.variant("type", [
  v.object({
    type: v.literal("tag"),
    condition: v.optional(v.fallback(v.picklist(["has", "lacks"]), "has"), "has"),
    tags: v.optional(v.array(v.string()), []),
  }),
  v.object({
    type: v.literal("heading"),
    condition: v.optional(v.fallback(v.picklist(["under", "not-under"]), "under"), "under"),
    headings: v.optional(v.array(v.string()), []),
  }),
]);

export const checkboxRuleSchema = v.object({
  mode: v.optional(v.fallback(v.picklist(["and", "or"]), "and"), "and"),
  conditions: v.optional(v.array(checkboxConditionSchema), []),
});

export const checkboxJournalRuleSchema = v.object({
  compose: v.optional(v.fallback(v.picklist(["inherit", "narrow", "replace"]), "inherit"), "inherit"),
  mode: v.optional(v.fallback(v.picklist(["and", "or"]), "and"), "and"),
  conditions: v.optional(v.array(checkboxConditionSchema), []),
});

export type CheckboxCondition = v.InferOutput<typeof checkboxConditionSchema>;
export type CheckboxRule = v.InferOutput<typeof checkboxRuleSchema>;
export type CheckboxJournalRule = v.InferOutput<typeof checkboxJournalRuleSchema>;
