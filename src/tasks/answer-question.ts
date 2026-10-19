import type { AnchorString } from "@/calendar";
import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { rolesOf } from "./date-choice";
import { composeDatedFilter, composeFilters, matchesFilter } from "./filter";
import { sourceNotes, type TaskListingDependencies } from "./listing";
import { isExcluded } from "./status";

import type { TaskCondition, TaskRule } from "./conditions";
import type { TaskQuestion } from "./question";
import type { TaskItem } from "./types";

export interface TaskQuestionDependencies {
  readonly journals: TaskListingDependencies["journals"];
  readonly index: Pick<TaskListingDependencies["index"], "noteletsAt">;
  readonly cycle: Pick<TaskListingDependencies["cycle"], "startOf" | "endOf">;
  readonly structure: TaskListingDependencies["structure"];
  readonly tasks: Pick<TaskListingDependencies["tasks"], "itemsIn" | "datedIn">;
}

interface Counted {
  readonly item: TaskItem;
  readonly structure: NoteStructure | undefined;
}

interface Target {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath | null;
}

// Heading and tag conditions select who is asked; the status condition is the question itself.
function split(rule: TaskRule): { readonly who: TaskRule; readonly what: TaskRule } {
  return {
    who: { mode: rule.mode, conditions: rule.conditions.filter((c) => c.type !== "status") },
    what: { mode: rule.mode, conditions: rule.conditions.filter((c) => c.type === "status") },
  };
}

// Cold metadataCache leaves structure undefined; matchesFilter then drops the heading and tag
// conditions for the item rather than failing it, so the answer over-matches until it resolves.
// Only heading and tag conditions read it, so a status-only question never asks for it.
function structureFor(
  dependencies: TaskQuestionDependencies,
  who: TaskRule,
  path: VaultPath,
): NoteStructure | undefined {
  return who.conditions.length === 0 ? undefined : dependencies.structure.get(path).getOrUndefined();
}

// Mirrors the listing's dated pass: the period's own range, whatever the source, and every
// non-excluded item there is something on the day — counted before the who-filter, the way a
// notelet is a source before any of its items match.
function datedHere(
  dependencies: TaskQuestionDependencies,
  target: Target,
  question: TaskQuestion,
  counted: ReadonlySet<string>,
): readonly TaskItem[] {
  const start = dependencies.cycle.startOf(target.journalName, target.anchor);
  const end = dependencies.cycle.endOf(target.journalName, target.anchor);
  if (start.isNone() || end.isNone()) return [];
  return dependencies.tasks
    .datedIn(rolesOf(question.date), start.value.toAnchor(), end.value.toAnchor())
    .filter((item) => !counted.has(item.key) && !isExcluded(item.status));
}

// A journal's stored status condition is the question when the decoration says "as in listing",
// and composeFilters supplies the listing's own default when it names none.
export function answerTaskQuestion(
  dependencies: TaskQuestionDependencies,
  target: Target,
  question: TaskQuestion,
): boolean {
  const explicit: TaskCondition[] =
    question.status === "listing" ? [] : [{ type: "status", condition: "is", statuses: [question.status] }];
  const journalFilter = dependencies.journals.get(target.journalName).getOrUndefined()?.tasks.filter ?? null;
  const asked: TaskRule = { mode: question.filter.mode, conditions: [...question.filter.conditions, ...explicit] };
  const contained = split(composeFilters(journalFilter, asked));
  const dated = split(composeDatedFilter(journalFilter, asked));

  const sources = sourceNotes(dependencies, [target], question.source);
  // A task note sitting at a period note's own path is reached by its date, never by containment.
  const counted: Counted[] = sources.flatMap((source) => {
    const { path } = source.source;
    const structure = structureFor(dependencies, contained.who, path);
    return dependencies.tasks
      .itemsIn(path)
      .filter(
        (item) =>
          item.relations.includes("containment") &&
          !isExcluded(item.status) &&
          matchesFilter(item, structure, contained.who),
      )
      .map((item) => ({ item, structure }));
  });
  const containedHits = counted.filter(({ item, structure }) => matchesFilter(item, structure, contained.what));

  const present = datedHere(dependencies, target, question, new Set(counted.map(({ item }) => item.key)));
  const datedCounted: Counted[] = present
    .map((item) => ({ item, structure: structureFor(dependencies, dated.who, item.path) }))
    .filter(({ item, structure }) => matchesFilter(item, structure, dated.who));
  const datedHits = datedCounted.filter(({ item, structure }) => matchesFilter(item, structure, dated.what));

  const total = counted.length + datedCounted.length;
  const hits = containedHits.length + datedHits.length;
  switch (question.quantifier) {
    case "any": {
      return hits > 0;
    }
    case "all": {
      return total > 0 && hits === total;
    }
    case "none": {
      return (sources.length > 0 || present.length > 0) && hits === 0;
    }
  }
}
