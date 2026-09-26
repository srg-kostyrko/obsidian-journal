// Building blocks shared by the two condition-editor form schemas — this file's own
// task-rule-form-schema.ts (all three arms) and the checkbox provider's rule-form-schema.ts
// (tag/heading only). The two schemas differ only in which arms their v.variant lists, never in
// how an arm itself is shaped, so only the per-arm object schemas and the shared error-extraction
// live here; each caller still states its own arm list explicitly, which is what keeps the
// checkbox side from ever accepting a status condition — see rule-form-schema.ts's own comment
// for why that has to stay an explicit choice rather than something this module could default.
import * as v from "valibot";

import { m } from "@/i18n";

// Built inside a function rather than at module scope: initLocale() runs in onload(), so an
// `m.*()` call evaluated at import time would bake in the base locale's message forever.
export function buildConditionFormSchemas() {
  return {
    tag: v.object({
      type: v.literal("tag"),
      condition: v.picklist(["has", "lacks"]),
      tags: v.pipe(v.array(v.string()), v.minLength(1, m.tasks_condition_values_required())),
    }),
    heading: v.object({
      type: v.literal("heading"),
      condition: v.picklist(["under", "not-under"]),
      headings: v.pipe(v.array(v.string()), v.minLength(1, m.tasks_condition_values_required())),
    }),
    status: v.object({
      type: v.literal("status"),
      condition: v.picklist(["is", "is-not"]),
      statuses: v.pipe(v.array(v.string()), v.minLength(1, m.tasks_condition_values_required())),
    }),
  };
}

// Maps each invalid condition's index to its first error message. RuleEditor's model is keyed by
// array position, not by an id, so index is the only handle a caller has to place the message next
// to the right row.
export function conditionFormErrors(
  schema: v.GenericSchema,
  draft: { mode: "and" | "or"; conditions: unknown[] },
): ReadonlyMap<number, string> {
  const result = v.safeParse(schema, draft);
  const errors = new Map<number, string>();
  if (result.success) return errors;
  for (const issue of result.issues) {
    const [first, second] = issue.path ?? [];
    if (first?.key !== "conditions" || typeof second?.key !== "number") continue;
    if (!errors.has(second.key)) errors.set(second.key, issue.message);
  }
  return errors;
}
