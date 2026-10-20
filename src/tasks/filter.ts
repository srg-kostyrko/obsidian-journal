import { match } from "ts-pattern";

import type { NoteStructure, StructureListItem } from "@/infrastructure/host";

import { STATUS_ALIASES, type TaskCondition, type TaskRule } from "./conditions";
import { headingsOf, tagsOf } from "./note-structure";
import { DEFAULT_STATUS_CONDITION } from "./query";

import type { TaskItem } from "./types";

function expand(statuses: readonly string[]): readonly string[] {
  return statuses.flatMap((name) => STATUS_ALIASES[name] ?? [name]);
}

function lineItemOf(item: TaskItem, structure: NoteStructure | undefined): StructureListItem | undefined {
  if (item.display.kind !== "line" || structure === undefined) return undefined;
  const line = item.display.line;
  return structure.listItems.find((candidate) => candidate.line === line);
}

// A whole-note item is tagged by its own frontmatter: it has no line for inline tags to sit on.
// Its tags come from the item, not the live structure, so a tag edit is a change to the item.
function tagsFor(item: TaskItem, structure: NoteStructure | undefined): readonly string[] | undefined {
  if (item.display.kind === "note") return item.facts?.tags;
  if (structure === undefined) return undefined;
  const listItem = lineItemOf(item, structure);
  return listItem === undefined ? undefined : tagsOf(listItem, structure);
}

// undefined means the condition does not apply to this item and is removed from the set — not
// false, which would silently drop a whole provider under `and`, and not true, which under `or`
// would carry every item the condition cannot even read.
function evaluate(condition: TaskCondition, item: TaskItem, structure: NoteStructure | undefined): boolean | undefined {
  return match(condition)
    .with({ type: "status" }, (c) => {
      if (c.statuses.length === 0) return true;
      const hit = expand(c.statuses).includes(item.status);
      return c.condition === "is" ? hit : !hit;
    })
    .with({ type: "heading" }, (c) => {
      if (c.headings.length === 0) return true;
      // structure is undefined on a cold metadataCache read, before it resolves for this note —
      // drop rather than exclude, so a fence briefly over-matches and self-heals once metadata
      // resolves, instead of a provider's items vanishing until then.
      if (item.display.kind !== "line" || structure === undefined) return;
      const chain = headingsOf(item.display.line, structure);
      const hit = c.headings.some((heading) => chain.includes(heading));
      return c.condition === "under" ? hit : !hit;
    })
    .with({ type: "tag" }, (c) => {
      if (c.tags.length === 0) return true;
      // Same cold-cache read as the heading branch above: drop rather than exclude.
      const tags = tagsFor(item, structure);
      if (tags === undefined) return;
      const hit = c.tags.some((tag) => tags.includes(tag));
      return c.condition === "has" ? hit : !hit;
    })
    .exhaustive();
}

export function matchesFilter(item: TaskItem, structure: NoteStructure | undefined, filter: TaskRule): boolean {
  const verdicts = filter.conditions
    .map((condition) => evaluate(condition, item, structure))
    .filter((verdict): verdict is boolean => verdict !== undefined);
  if (verdicts.length === 0) return true;
  return filter.mode === "or" ? verdicts.some(Boolean) : verdicts.every(Boolean);
}

// A query condition replaces the journal's of the same type. ANDing them instead would let a
// fence only ever narrow what the journal allows, leaving anything the journal excludes
// unreachable from any fence.
function merge(journalFilter: TaskRule | null, queryFilter: TaskRule): TaskRule {
  if (journalFilter === null || journalFilter.conditions.length === 0) return queryFilter;
  const overridden = new Set(queryFilter.conditions.map((condition) => condition.type));
  return {
    mode: queryFilter.mode,
    conditions: [
      ...journalFilter.conditions.filter((condition) => !overridden.has(condition.type)),
      ...queryFilter.conditions,
    ],
  };
}

// The composed filter is what a listing actually runs, and it takes the query's mode: one flat
// condition list has one combinator and nesting is ruled out by design, so a journal contributes
// conditions only — which is why the journal's own filter editor offers no mode control while the
// view block's, whose filter IS the query, keeps it.
//
// The listing's own status default is added here rather than by either surface, for two reasons.
// It has to apply last: emitted into a query it is a query condition, and replace-by-type then
// overrides the journal's stored status condition on every surface, so a journal saying "show all
// statuses" or "only in progress" could never reach a bare fence. And it has to apply to both the
// fence and the view block, neither of which should have to remember to ask — every listing reaches
// here through buildTaskListing. A filter naming no status therefore behaves exactly as one whose
// status condition is Open, including under `or`, where an explicit Open condition widens the union
// the same way.
export function composeFilters(journalFilter: TaskRule | null, queryFilter: TaskRule): TaskRule {
  const merged = merge(journalFilter, queryFilter);
  if (merged.conditions.some((condition) => condition.type === "status")) return merged;
  return { mode: merged.mode, conditions: [...merged.conditions, { ...DEFAULT_STATUS_CONDITION }] };
}

// A journal's stored tag and heading conditions were written for its own checkbox lines; a task
// note, or a dated line in a note no journal owns, is none of them, so only the stored status
// reaches it. What the surface names itself still applies in full.
export function composeDatedFilter(journalFilter: TaskRule | null, queryFilter: TaskRule): TaskRule {
  const statusOnly =
    journalFilter === null
      ? null
      : { mode: journalFilter.mode, conditions: journalFilter.conditions.filter((c) => c.type === "status") };
  return composeFilters(statusOnly, queryFilter);
}
