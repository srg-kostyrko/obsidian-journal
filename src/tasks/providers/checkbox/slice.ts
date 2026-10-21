import * as v from "valibot";

import { defineSlice } from "@/settings";

import { markerProblem } from "./marker";
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

// statusMap and canonical are Record<string, string> rather than enums on purpose: unknown type
// names in normalizeStatus resolve to todo on read instead of failing the slice.
export const checkboxSliceSchema = v.object({
  enabled: v.optional(v.boolean(), true),
  rule: v.optional(checkboxRuleSchema, { mode: "and", conditions: [] }),
  statusMap: v.optional(v.record(v.string(), v.string()), DEFAULT_STATUS_MAP),
  canonical: v.optional(v.record(v.string(), v.string()), DEFAULT_CANONICAL),
  rolledMarker: v.optional(
    v.pipe(
      v.string(),
      v.check((marker) => markerProblem(marker) === null),
    ),
    "#rolled",
  ),
});

export type CheckboxSliceState = v.InferOutput<typeof checkboxSliceSchema>;

export const checkboxSlice = defineSlice<"tasksCheckbox", typeof checkboxSliceSchema>(
  "tasksCheckbox",
  checkboxSliceSchema,
  {
    enabled: true,
    rule: { mode: "and", conditions: [] },
    statusMap: DEFAULT_STATUS_MAP,
    canonical: DEFAULT_CANONICAL,
    rolledMarker: "#rolled",
  },
);
