// Leaf on purpose: journalConfigSchema imports this file, and the tasks module imports journals.
import * as v from "valibot";

import { lowerScalars } from "./scalars";

import type { TaskItem } from "../../types";

// Per entry, not per list: an emptied list is a no-op condition, which would quietly widen a
// Matching rule to every task note over one unreadable entry.
const stringList = v.optional(
  v.fallback(
    v.pipe(
      v.array(v.unknown()),
      v.transform((items) => items.filter((item): item is string => typeof item === "string")),
    ),
    [],
  ),
  [],
);

const visibilityConditionSchema = v.variant("type", [
  v.object({ type: v.literal("tag"), tags: stringList }),
  v.object({ type: v.literal("folder"), folders: stringList }),
  v.object({ type: v.literal("property"), name: v.string(), values: stringList }),
]);

export type VisibilityCondition = v.InferOutput<typeof visibilityConditionSchema>;

// A condition this version cannot read is dropped on its own, so a vault synced from a newer
// version keeps the conditions it does understand instead of losing the whole rule.
const conditionsSchema = v.pipe(
  v.array(v.unknown()),
  v.transform((items): VisibilityCondition[] =>
    items.flatMap((item) => {
      const parsed = v.safeParse(visibilityConditionSchema, item);
      return parsed.success ? [parsed.output] : [];
    }),
  ),
);

export const noteVisibilitySchema = v.object({
  show: v.optional(v.fallback(v.picklist(["all", "matching", "none"]), "all"), "all"),
  mode: v.optional(v.fallback(v.picklist(["and", "or"]), "and"), "and"),
  conditions: v.optional(v.fallback(conditionsSchema, []), []),
});

export type NoteVisibility = v.InferOutput<typeof noteVisibilitySchema>;

export const DEFAULT_NOTE_VISIBILITY: NoteVisibility = { show: "all", mode: "and", conditions: [] };

const INTERNAL_LINK = /^\[\[([^\]|#^]+)(?:[#^|][^\]]*)?\]\]$/u;

function linkTarget(text: string): string | undefined {
  const link = INTERNAL_LINK.exec(text.trim());
  return link === null ? undefined : (link[1] ?? "").trim().replace(/\.md$/u, "");
}

// TaskNotes writes `projects: ["[[Website]]"]`, so a condition naming the link target has to match
// the link, by its full path or by the note name alone.
function valueForms(text: string): string[] {
  const target = linkTarget(text);
  if (target === undefined) return [text];
  const name = target.split("/").at(-1) ?? target;
  return name === target ? [target] : [target, name];
}

// A condition typed as a link or a file name names a note too, but only by its full target: the
// bare name of `[[Projects/Website]]` would also match `[[Archive/Website]]`.
function wantedForms(text: string): string[] {
  const target = linkTarget(text);
  return target === undefined ? [text, text.replace(/\.md$/u, "")] : [target];
}

function propertyMatches(value: unknown, wanted: readonly string[]): boolean {
  const forms = new Set(lowerScalars(value).flatMap(valueForms));
  return wanted.some((candidate) => wantedForms(candidate.toLowerCase()).some((form) => forms.has(form)));
}

// Obsidian's tag search: `#work` finds `#work/project`, never `#workshop`.
function tagMatches(tag: string, wanted: string): boolean {
  return tag === wanted || tag.startsWith(`${wanted}/`);
}

function folderPrefix(folder: string): string {
  return folder.replace(/\/+$/u, "");
}

// undefined is a condition with nothing to compare against: it is left out of the combination
// rather than deciding it, the way the form would refuse to save it.
function evaluate(condition: VisibilityCondition, item: TaskItem, facts: NonNullable<TaskItem["facts"]>) {
  switch (condition.type) {
    case "tag": {
      if (condition.tags.length === 0) return;
      const tags = facts.frontmatterTags.map((tag) => tag.toLowerCase());
      return condition.tags.some((wanted) => tags.some((tag) => tagMatches(tag, wanted.toLowerCase())));
    }
    case "folder": {
      // An empty entry would be the vault root, and a root that admits every path cannot narrow.
      const prefixes = condition.folders.map(folderPrefix).filter((prefix) => prefix !== "");
      if (prefixes.length === 0) return;
      return prefixes.some((prefix) => item.path.startsWith(`${prefix}/`));
    }
    case "property": {
      if (condition.values.length === 0) return;
      return propertyMatches(facts.properties?.[condition.name], condition.values);
    }
  }
}

// An item without facts is not a task note, and the rule is about task notes only.
export function admits(rule: NoteVisibility | undefined, item: TaskItem): boolean {
  if (rule === undefined || item.facts === undefined) return true;
  if (rule.show === "all") return true;
  if (rule.show === "none") return false;
  const facts = item.facts;
  const verdicts = rule.conditions.flatMap((condition) => evaluate(condition, item, facts) ?? []);
  if (verdicts.length === 0) return true;
  return rule.mode === "and" ? verdicts.every(Boolean) : verdicts.some(Boolean);
}

export function referencedProperties(rules: Iterable<NoteVisibility | undefined>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const rule of rules) {
    if (rule?.show !== "matching") continue;
    for (const condition of rule.conditions) {
      if (condition.type === "property" && condition.values.length > 0) names.add(condition.name);
    }
  }
  return names;
}
