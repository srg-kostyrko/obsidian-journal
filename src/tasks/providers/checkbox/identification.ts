import { match } from "ts-pattern";

import type { NoteStructure, StructureListItem } from "@/infrastructure/host";

import type { CheckboxCondition, CheckboxJournalRule, CheckboxRule } from "./rule-schema";

export interface IdentificationContext {
  readonly structure: NoteStructure;
  readonly vault: CheckboxRule;
  readonly journal: CheckboxJournalRule | null;
}

function tagsOf(item: StructureListItem, structure: NoteStructure): readonly string[] {
  const inline = structure.tags
    .filter((tag) => tag.line >= item.line && tag.line <= item.endLine)
    .map((tag) => tag.tag);
  return [...inline, ...structure.frontmatterTags];
}

function headingsOf(item: StructureListItem, structure: NoteStructure): readonly string[] {
  const chain: string[] = [];
  let level = Infinity;
  for (const heading of structure.headings.toReversed()) {
    if (heading.line >= item.line) continue;
    if (heading.level >= level) continue;
    chain.push(heading.heading);
    level = heading.level;
  }
  return chain;
}

function check(condition: CheckboxCondition, item: StructureListItem, structure: NoteStructure): boolean {
  return (
    match(condition)
      .with({ type: "tag" }, (c) => {
        if (c.tags.length === 0) return true;
        const present = tagsOf(item, structure);
        const hit = c.tags.some((tag) => present.includes(tag));
        return c.condition === "has" ? hit : !hit;
      })
      .with({ type: "heading" }, (c) => {
        if (c.headings.length === 0) return true;
        const chain = headingsOf(item, structure);
        const hit = c.headings.some((heading) => chain.includes(heading));
        return c.condition === "under" ? hit : !hit;
      })
      // Identification decides what counts as a task; a status condition belongs to filtering and
      // never constrains it.
      .with({ type: "status" }, () => true)
      .exhaustive()
  );
}

// An empty condition list means "no constraint" — the inverse of DecorationEngine, where an
// empty list matches nothing. The shipped default is empty, and it has to keep every existing
// has-open-task decoration matching.
function evaluate(
  rule: CheckboxRule | CheckboxJournalRule,
  item: StructureListItem,
  structure: NoteStructure,
): boolean {
  if (rule.conditions.length === 0) return true;
  const test = (c: CheckboxCondition): boolean => check(c, item, structure);
  return rule.mode === "or" ? rule.conditions.some(test) : rule.conditions.every(test);
}

export function identifies(item: StructureListItem, context: IdentificationContext): boolean {
  const { structure, vault, journal } = context;
  if (!journal || journal.compose === "inherit") return evaluate(vault, item, structure);
  if (journal.compose === "replace") return evaluate(journal, item, structure);
  return evaluate(vault, item, structure) && evaluate(journal, item, structure);
}
