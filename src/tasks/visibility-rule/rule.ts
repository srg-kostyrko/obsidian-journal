// Leaf on purpose: journalConfigSchema imports this file, and the tasks module imports journals.
import * as v from "valibot";

import type { VaultPath } from "@/infrastructure/host";
import { isUnreadable, orUnreadable, type Unreadable } from "@/settings/repair";

import { storedConditionsSchema, type UnreadableCondition } from "../conditions";
import { carriesAnyTag } from "../tag-match";

import { lowerScalars } from "./scalars";

// Per entry, not per list: an unreadable entry among readable ones only narrows the condition.
// One whose every entry is unreadable fails, so the condition is kept as unreadable rather than
// read as empty, which would be no condition at all.
const stringList = v.optional(
  v.pipe(
    v.array(v.unknown()),
    v.check((items) => items.length === 0 || items.some((item) => typeof item === "string")),
    v.transform((items) => items.filter((item): item is string => typeof item === "string")),
  ),
  [],
);

const visibilityConditionSchema = v.variant("type", [
  v.object({ type: v.literal("tag"), tags: stringList }),
  v.object({ type: v.literal("folder"), folders: stringList }),
  v.object({ type: v.literal("property"), name: v.string(), values: stringList }),
]);

export type VisibilityCondition = v.InferOutput<typeof visibilityConditionSchema> | UnreadableCondition;

const visibilityRuleObjectSchema = v.object({
  show: v.optional(v.picklist(["all", "matching", "none"]), "all"),
  mode: v.optional(v.picklist(["and", "or"]), "and"),
  conditions: storedConditionsSchema(visibilityConditionSchema),
});

export type VisibilityRule = v.InferOutput<typeof visibilityRuleObjectSchema>;
export type StoredVisibilityRule = VisibilityRule | Unreadable;

// A rule it cannot read is held whole and shows nothing: this rule is also re-parsed at read time,
// outside the settings repair, so the schema itself is the whole of its repair.
export const visibilityRuleSchema = orUnreadable(visibilityRuleObjectSchema);

export const DEFAULT_VISIBILITY_RULE: VisibilityRule = { show: "all", mode: "and", conditions: [] };

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

function folderPrefix(folder: string): string {
  return folder.replace(/\/+$/u, "");
}

// undefined is a condition with nothing to compare against: it is left out of the combination
// rather than deciding it, the way the form would refuse to save it.
function evaluate(condition: VisibilityCondition, subject: VisibilitySubject) {
  switch (condition.type) {
    case "unreadable": {
      return false;
    }
    case "tag": {
      if (condition.tags.length === 0) return;
      return carriesAnyTag(subject.tags, condition.tags);
    }
    case "folder": {
      // An empty entry would be the vault root, and a root that admits every path cannot narrow.
      const prefixes = condition.folders.map(folderPrefix).filter((prefix) => prefix !== "");
      if (prefixes.length === 0) return;
      return prefixes.some((prefix) => subject.path.startsWith(`${prefix}/`));
    }
    case "property": {
      if (condition.values.length === 0) return;
      return propertyMatches(subject.properties?.[condition.name], condition.values);
    }
  }
}

export interface VisibilitySubject {
  readonly path: VaultPath;
  readonly tags: readonly string[];
  readonly properties?: Readonly<Record<string, unknown>>;
}

export function admitsSubject(rule: StoredVisibilityRule | undefined, subject: VisibilitySubject): boolean {
  if (rule === undefined) return true;
  if (isUnreadable(rule) || rule.show === "none") return false;
  if (rule.show === "all") return true;
  const verdicts = rule.conditions.flatMap((condition) => evaluate(condition, subject) ?? []);
  if (verdicts.length === 0) return true;
  return rule.mode === "and" ? verdicts.every(Boolean) : verdicts.some(Boolean);
}

export function referencedProperties(rules: Iterable<StoredVisibilityRule | undefined>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const rule of rules) {
    if (rule === undefined || isUnreadable(rule) || rule.show !== "matching") continue;
    for (const condition of rule.conditions) {
      if (condition.type === "property" && condition.values.length > 0) names.add(condition.name);
    }
  }
  return names;
}
