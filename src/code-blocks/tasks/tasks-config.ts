import * as v from "valibot";

import { taskConditionSchema, type TaskCondition } from "@/tasks/conditions";
import { DEFAULT_TASK_QUERY, taskSorts, type TaskQuery } from "@/tasks/query";

import { asFenceStringList, asRecord } from "../fence-record";

// Whatever condition the query's own default names for a bare filter — read off the frozen
// default rather than duplicating "open" as a magic literal, so the two stay in lockstep if the
// query's own default ever moves.
const defaultStatusCondition = DEFAULT_TASK_QUERY.filter.conditions.at(0);
const DEFAULT_STATUSES: readonly string[] =
  defaultStatusCondition?.type === "status" ? defaultStatusCondition.statuses : ["open"];

// Same double-wrap query.ts's own scope/sort fields use: `optional` covers a missing key,
// `fallback` covers a present one that fails the enum check (wrong type, or a value the block
// does not know) — both land on the same default rather than throwing into an error panel.
const sourceEntry = v.optional(
  v.fallback(v.picklist(["note", "notelets", "both"]), DEFAULT_TASK_QUERY.scope.source),
  DEFAULT_TASK_QUERY.scope.source,
);
const depthEntry = v.optional(
  v.fallback(v.picklist(["literal", "rollup"]), DEFAULT_TASK_QUERY.scope.depth),
  DEFAULT_TASK_QUERY.scope.depth,
);
const sortEntry = v.optional(v.fallback(v.picklist(taskSorts), DEFAULT_TASK_QUERY.sort), DEFAULT_TASK_QUERY.sort);

// Raw and flat, one field per fence key, kept 1:1 with what the user writes — `tasksBlockKeys`
// below is derived straight from this object, so a key added here is a key the fence recognizes.
// No `date` key: the date relation is a later ticket, and a key that parses but does nothing is
// worse than one reported as unrecognized (`CLAUDE.md`).
const rawEntries = {
  provider: v.optional(v.pipe(v.unknown(), v.transform(asFenceStringList)), () => [] as string[]),
  source: sourceEntry,
  depth: depthEntry,
  status: v.optional(v.pipe(v.unknown(), v.transform(asFenceStringList))),
  heading: v.optional(v.pipe(v.unknown(), v.transform(asFenceStringList))),
  tag: v.optional(v.pipe(v.unknown(), v.transform(asFenceStringList))),
  sort: sortEntry,
  conditions: v.optional(v.fallback(v.array(taskConditionSchema), [] as TaskCondition[]), []),
};

// Derived from the entries so the two can never drift: the block reports any other key as
// unrecognized rather than ignoring it and rendering a plausible-looking wrong block.
export const tasksBlockKeys = Object.keys(rawEntries);

const rawSchema = v.pipe(v.unknown(), v.transform(asRecord), v.object(rawEntries));

type RawFenceConfig = v.InferOutput<typeof rawSchema>;

// Desugar order is fixed: scope keys (provider/source/depth) first — they set a scope field each,
// never a condition — then `status`, then the selection-shaped keys `heading` and `tag`, in that
// order. Each flat key desugars into exactly one condition or sets one scope field; that
// one-to-one property is the whole reason there are two keys (`heading`, `tag`) rather than one
// merged `selection` key. `conditions:` is the escape hatch, taking the full `TaskCondition` form,
// and is always appended after every desugared key.
function toTaskQuery(raw: RawFenceConfig): TaskQuery {
  const conditions: TaskCondition[] = [
    { type: "status", condition: "is", statuses: raw.status ?? [...DEFAULT_STATUSES] },
  ];
  if (raw.heading !== undefined) conditions.push({ type: "heading", condition: "under", headings: raw.heading });
  if (raw.tag !== undefined) conditions.push({ type: "tag", condition: "has", tags: raw.tag });
  conditions.push(...raw.conditions);

  return {
    scope: { provider: raw.provider, source: raw.source, depth: raw.depth },
    filter: { mode: "and", conditions },
    sort: raw.sort,
  };
}

export const tasksBlockSchema = v.pipe(rawSchema, v.transform(toTaskQuery));

export type TasksFenceConfig = TaskQuery;
