import { match } from "ts-pattern";

import type { NoteStructure, StructureListItem } from "@/infrastructure/host";

import { STATUS_ALIASES, type TaskCondition, type TaskRule } from "./conditions";
import { headingsOf, tagsOf } from "./note-structure";

import type { TaskItem } from "./types";

function expand(statuses: readonly string[]): readonly string[] {
  return statuses.flatMap((name) => STATUS_ALIASES[name] ?? [name]);
}

function lineItemOf(item: TaskItem, structure: NoteStructure | undefined): StructureListItem | undefined {
  if (item.display.kind !== "line" || structure === undefined) return undefined;
  const line = item.display.line;
  return structure.listItems.find((candidate) => candidate.line === line);
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
      // Dropped rather than resolved against the note's own frontmatter tags for a note-shaped
      // item: only the checkbox provider ships here, so nothing yields a note-kind item yet and
      // the choice is unobservable — see "Still to establish" in docs/tasks-model.md.
      // Same cold-cache read as the heading branch above: drop rather than exclude.
      const listItem = lineItemOf(item, structure);
      if (listItem === undefined || structure === undefined) return;
      const hit = c.tags.some((tag) => tagsOf(listItem, structure).includes(tag));
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
export function composeFilters(journalFilter: TaskRule | null, queryFilter: TaskRule): TaskRule {
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
