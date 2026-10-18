import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import { composeFilters, matchesFilter } from "./filter";
import { sourceNotes, type TaskListingDependencies } from "./listing";
import { isExcluded } from "./status";

import type { TaskCondition } from "./conditions";
import type { TaskQuestion } from "./question";

export interface TaskQuestionDependencies {
  readonly journals: TaskListingDependencies["journals"];
  readonly index: Pick<TaskListingDependencies["index"], "noteletsAt">;
  readonly structure: TaskListingDependencies["structure"];
  readonly tasks: Pick<TaskListingDependencies["tasks"], "itemsIn">;
}

// Heading and tag conditions select who is asked; the status condition is the question itself. A
// journal's stored status condition is the question when the decoration says "as in listing", and
// composeFilters supplies the listing's own default when it names none.
export function answerTaskQuestion(
  dependencies: TaskQuestionDependencies,
  target: { journalName: string; anchor: AnchorString; path: VaultPath | null },
  question: TaskQuestion,
): boolean {
  const explicit: TaskCondition[] =
    question.status === "listing" ? [] : [{ type: "status", condition: "is", statuses: [question.status] }];
  const journal = dependencies.journals.get(target.journalName).getOrUndefined();
  const composed = composeFilters(journal?.tasks.filter ?? null, {
    mode: question.filter.mode,
    conditions: [...question.filter.conditions, ...explicit],
  });
  const who = { mode: composed.mode, conditions: composed.conditions.filter((c) => c.type !== "status") };
  const what = { mode: composed.mode, conditions: composed.conditions.filter((c) => c.type === "status") };

  const sources = sourceNotes(dependencies, [target], question.source);
  const counted = sources.flatMap((source) => {
    const { path } = source.source;
    // Cold metadataCache leaves structure undefined; matchesFilter then drops the heading and tag
    // conditions for the item rather than failing it, so the answer over-matches until it resolves.
    const structure = dependencies.structure.get(path).getOrUndefined();
    return dependencies.tasks
      .itemsIn(path)
      .filter((item) => !isExcluded(item.status) && matchesFilter(item, structure, who))
      .map((item) => ({ item, structure }));
  });
  const hits = counted.filter(({ item, structure }) => matchesFilter(item, structure, what));

  switch (question.quantifier) {
    case "any": {
      return hits.length > 0;
    }
    case "all": {
      return counted.length > 0 && hits.length === counted.length;
    }
    case "none": {
      return sources.length > 0 && hits.length === 0;
    }
  }
}
