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
};

// statusMap and canonical are Record<string, string> rather than enums on purpose, and each field
// wraps its schema in v.fallback to isolate repair. A structurally malformed value — not an object,
// or an object with non-string entries — resets only that field, not the whole slice.
// Unknown type names in normalizeStatus resolve to todo on read instead of throwing.
export const checkboxSliceSchema = v.object({
  enabled: v.optional(v.fallback(v.boolean(), true), true),
  rule: v.optional(v.fallback(checkboxRuleSchema, { mode: "and", conditions: [] }), { mode: "and", conditions: [] }),
  statusMap: v.optional(v.fallback(v.record(v.string(), v.string()), DEFAULT_STATUS_MAP), DEFAULT_STATUS_MAP),
  canonical: v.optional(v.fallback(v.record(v.string(), v.string()), DEFAULT_CANONICAL), DEFAULT_CANONICAL),
});

export type CheckboxSliceState = v.InferOutput<typeof checkboxSliceSchema>;

export const checkboxSlice = defineSlice<"tasksCheckbox", typeof checkboxSliceSchema>(
  "tasksCheckbox",
  checkboxSliceSchema,
  { enabled: true, rule: { mode: "and", conditions: [] }, statusMap: DEFAULT_STATUS_MAP, canonical: DEFAULT_CANONICAL },
);
