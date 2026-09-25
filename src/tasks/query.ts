// Leaf on purpose: journalConfigSchema imports conditions.ts and the tasks module imports
// journals — any further import here closes a cycle. valibot and ./conditions only.
import * as v from "valibot";

import { taskRuleSchema } from "./conditions";

export const taskSorts = ["document", "status", "due", "scheduled", "start", "done", "created"] as const;
export type TaskSort = (typeof taskSorts)[number];

// No `date` key: the date relation is a later ticket, and a key that parses but does nothing is
// worse than one reported as unrecognized.
const scopeSchema = v.object({
  provider: v.optional(v.array(v.string()), []),
  source: v.optional(v.fallback(v.picklist(["note", "notelets", "both"]), "both"), "both"),
  depth: v.optional(v.fallback(v.picklist(["literal", "rollup"]), "literal"), "literal"),
});

// A listing reads where a move writes, so it defaults wider than the model's move default
// (source: "note"): a bare fence in a day note must not just mirror the note it sits in, and an
// item already ticked should drop out of view by default.
export const taskQuerySchema = v.object({
  scope: v.optional(scopeSchema, () => v.parse(scopeSchema, {})),
  filter: v.optional(taskRuleSchema, () =>
    v.parse(taskRuleSchema, {
      mode: "and",
      conditions: [{ type: "status", condition: "is", statuses: ["open"] }],
    }),
  ),
  sort: v.optional(v.fallback(v.picklist(taskSorts), "document"), "document"),
});

export type TaskQuery = v.InferOutput<typeof taskQuerySchema>;

export const DEFAULT_TASK_QUERY: TaskQuery = v.parse(taskQuerySchema, {});
