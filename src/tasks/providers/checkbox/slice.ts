import * as v from "valibot";

import { defineSlice } from "@/settings";

import { checkboxRuleSchema } from "./rule-schema";

export const DEFAULT_STATUS_MAP: Record<string, string> = {
  " ": "todo",
  x: "done",
  X: "done",
  "/": "in-progress",
  "-": "cancelled",
};

export const DEFAULT_CANONICAL: Record<string, string> = {
  todo: " ",
  done: "x",
  "in-progress": "/",
  cancelled: "-",
  "on-hold": "todo",
  rolled: " ",
  "non-task": " ",
};

// statusMap and canonical are Record<string, string> rather than enums on purpose: a slice
// has no per-field repair, so one unrecognised value would reset every setting here. Unknown
// type names resolve to todo on read instead.
export const checkboxSliceSchema = v.object({
  enabled: v.optional(v.fallback(v.boolean(), true), true),
  rule: v.optional(v.fallback(checkboxRuleSchema, { mode: "and", conditions: [] }), { mode: "and", conditions: [] }),
  statusMap: v.optional(v.record(v.string(), v.string()), DEFAULT_STATUS_MAP),
  canonical: v.optional(v.record(v.string(), v.string()), DEFAULT_CANONICAL),
});

export type CheckboxSliceState = v.InferOutput<typeof checkboxSliceSchema>;

export const checkboxSlice = defineSlice<"tasksCheckbox", typeof checkboxSliceSchema>(
  "tasksCheckbox",
  checkboxSliceSchema,
  { enabled: true, rule: { mode: "and", conditions: [] }, statusMap: DEFAULT_STATUS_MAP, canonical: DEFAULT_CANONICAL },
);
