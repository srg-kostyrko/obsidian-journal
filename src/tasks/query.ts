// Leaf on purpose: journalConfigSchema imports conditions.ts and the tasks module imports
// journals — any further import here closes a cycle. valibot and ./conditions only.
import * as v from "valibot";

import { taskRuleSchema, type TaskCondition } from "./conditions";

export const taskSorts = ["document", "status", "due", "scheduled", "start", "done", "created"] as const;
export type TaskSort = (typeof taskSorts)[number];

// No `date` key: the date relation is a later ticket, and a key that parses but does nothing is
// worse than one reported as unrecognized.
const scopeSchema = v.object({
  provider: v.optional(v.array(v.string()), []),
  source: v.optional(v.fallback(v.picklist(["note", "notelets", "both"]), "both"), "both"),
  depth: v.optional(v.fallback(v.picklist(["literal", "rollup"]), "literal"), "literal"),
});

// The status a listing shows when nothing — the journal's filter, the surface's, or a fence key —
// names one. Applied by composeFilters (./filter.ts) after the two sides have been merged, never
// emitted into a surface's own query: a query condition replaces the journal's of the same type, so
// a default emitted up front would override a journal's stored status condition on every surface,
// however bare, and "show all statuses" on a journal could never reach a fence.
export const DEFAULT_STATUS_CONDITION: TaskCondition = { type: "status", condition: "is", statuses: ["open"] };

// A listing reads where a move writes, so it defaults wider than the model's move default
// (source: "note"): a bare fence in a day note must not just mirror the note it sits in, and an
// item already ticked should drop out of view by default.
export const taskQuerySchema = v.object({
  scope: v.optional(scopeSchema, () => v.parse(scopeSchema, {})),
  filter: v.optional(taskRuleSchema, () =>
    v.parse(taskRuleSchema, { mode: "and", conditions: [DEFAULT_STATUS_CONDITION] }),
  ),
  sort: v.optional(v.fallback(v.picklist(taskSorts), "document"), "document"),
});

export type TaskQuery = v.InferOutput<typeof taskQuerySchema>;

// DEFAULT_TASK_QUERY is exported as one shared instance that consumers spread (`{
// ...DEFAULT_TASK_QUERY, ...query }`); a shallow spread keeps the nested `scope`/`filter`/
// `conditions` objects shared, so a mutation of one consumer's "default" corrupts every other
// consumer that runs after it. Freezing every level turns that into a loud TypeError at the
// mutation site instead of a silent cross-consumer bug. `v.parse` output is unaffected — only
// this constant is frozen.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_TASK_QUERY: TaskQuery = deepFreeze(v.parse(taskQuerySchema, {}));
