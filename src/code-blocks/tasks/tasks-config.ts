import * as v from "valibot";

import { taskConditionSchema, type TaskCondition } from "@/tasks/conditions";
import { DEFAULT_TASK_QUERY, taskSorts, type TaskQuery } from "@/tasks/query";

import { asFenceStringList, asRecord } from "../fence-record";

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

// Output mirrors the raw fence keys flatly — no further transform — because
// `manual-fences.test.ts` does a flat per-key lookup (`output[key]`) to prove a documented
// example survives its schema unchanged. A nested `TaskQuery` output would make that check
// compare `output["status"]` (etc.) against `undefined` and misreport every key but `sort` as
// dropped, even when this schema handled it correctly. Desugaring into a `TaskQuery` is
// `toTaskQuery`'s job below, kept as a separate, directly testable step.
export const tasksBlockSchema = v.pipe(v.unknown(), v.transform(asRecord), v.object(rawEntries));

export type TasksFenceConfig = v.InferOutput<typeof tasksBlockSchema>;

// headingsOf() (src/tasks/note-structure.ts) compares against Obsidian's own HeadingCache.heading,
// which never carries the markdown "#" — so `## Tasks`, the spelling a user's own note shows and the
// one they will reach for first, must mean the same heading as `Tasks`, or it parses cleanly and
// matches nothing, with no error to say why. Stripped only when a run of "#" is followed by
// whitespace: that shape is unambiguously the ATX marker, so a heading whose own text starts with
// "#" and no following space — not markdown syntax — survives untouched.
function normalizeHeading(heading: string): string {
  return heading.replace(/^#+\s+/, "");
}

// The mirror case: metadataCache tags always carry the leading "#", so a tag named without one must
// still match. Left alone once it already starts with "#" — nothing here collapses a repeated one,
// unlike the settings editor's own coercion (conditionValues, condition-text.ts), which also has to
// undo a user's comma-separated typing; a fence value has no such shape to undo.
function normalizeTag(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

// Desugar order is fixed: scope keys (provider/source/depth) first — they set a scope field each,
// never a condition — then `status`, then the selection-shaped keys `heading` and `tag`, in that
// order. Each flat key desugars into exactly one condition or sets one scope field; that
// one-to-one property is the whole reason there are two keys (`heading`, `tag`) rather than one
// merged `selection` key. `conditions:` is the escape hatch, taking the full `TaskCondition` form,
// and is always appended after every desugared key. Exported (not just used by the fence) so a
// consumer sharing the same flat vocabulary — the tasks view block, following this fence — calls
// the same function instead of re-deriving its own desugaring.
export function toTaskQuery(raw: TasksFenceConfig): TaskQuery {
  const conditions: TaskCondition[] = [];
  // Only when the fence wrote `status:`. The bare-fence `status: open` default is applied after
  // composition instead (DEFAULT_STATUS_CONDITION, composeFilters) — emitted here it would be a
  // query condition, and replace-by-type would then override the owning journal's own status
  // condition on every fence, however bare.
  if (raw.status !== undefined) conditions.push({ type: "status", condition: "is", statuses: raw.status });
  if (raw.heading !== undefined) {
    conditions.push({ type: "heading", condition: "under", headings: raw.heading.map(normalizeHeading) });
  }
  if (raw.tag !== undefined) conditions.push({ type: "tag", condition: "has", tags: raw.tag.map(normalizeTag) });
  conditions.push(...raw.conditions);

  return {
    scope: { provider: raw.provider, source: raw.source, depth: raw.depth },
    filter: { mode: "and", conditions },
    sort: raw.sort,
  };
}
