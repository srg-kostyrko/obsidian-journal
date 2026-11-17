import type { JournalDecoration, JournalDecorationCondition } from "./config";

export interface CascadeResult {
  decorations: JournalDecoration[];
  /** Whole decorations dropped, in original order. */
  removed: JournalDecoration[];
  changed: boolean;
}

type Outcome = { kind: "keep"; condition: JournalDecorationCondition } | { kind: "dead" };

type TypeIdCondition = Extract<JournalDecorationCondition, { typeIds: string[] }>;

function carriesTypeIds(condition: JournalDecorationCondition): condition is TypeIdCondition {
  return condition.type === "has-notelet" || condition.type === "tag" || condition.type === "property";
}

function remapCondition(condition: JournalDecorationCondition, map: (id: string) => string | undefined): Outcome {
  if (!carriesTypeIds(condition) || condition.typeIds.length === 0) {
    return { kind: "keep", condition };
  }
  const typeIds = condition.typeIds.flatMap((id) => map(id) ?? []);
  // Note scope ignores typeIds, but the editor keeps them for a switch back to Notelets, so dead
  // ids are cleaned without ever dropping the condition.
  if (condition.type !== "has-notelet" && condition.source === "note") {
    const unchanged =
      typeIds.length === condition.typeIds.length && typeIds.every((id, i) => id === condition.typeIds[i]);
    return { kind: "keep", condition: unchanged ? condition : { ...condition, typeIds } };
  }
  if (typeIds.length > 0) {
    const unchanged =
      typeIds.length === condition.typeIds.length && typeIds.every((id, i) => id === condition.typeIds[i]);
    return { kind: "keep", condition: unchanged ? condition : { ...condition, typeIds } };
  }
  // A dangling id selects no notelet, so the rewrite must match exactly what the left-in-place id
  // would: an emptied list would instead read as "any type".
  if ((condition.type === "tag" || condition.type === "property") && condition.source === "both") {
    return { kind: "keep", condition: { ...condition, source: "note", typeIds: [] } };
  }
  return { kind: "dead" };
}

/** Rewrites notelet type ids across decorations without ever widening what a rule matches. */
export function remapNoteletTypeIds(
  decorations: readonly JournalDecoration[],
  map: (id: string) => string | undefined,
): CascadeResult {
  const kept: JournalDecoration[] = [];
  const removed: JournalDecoration[] = [];
  let changed = false;
  for (const decoration of decorations) {
    const outcomes = decoration.conditions.map((condition) => remapCondition(condition, map));
    const dead = outcomes.some((outcome) => outcome.kind === "dead");
    const conditions = outcomes.flatMap((outcome) => (outcome.kind === "keep" ? [outcome.condition] : []));
    const touched = dead || conditions.some((condition, i) => condition !== decoration.conditions[i]);
    if (!touched) {
      kept.push(decoration);
    } else if (dead && (decoration.mode === "and" || conditions.length === 0)) {
      removed.push(decoration);
      changed = true;
    } else {
      kept.push({ ...decoration, conditions });
      changed = true;
    }
  }
  return { decorations: changed ? kept : (decorations as JournalDecoration[]), removed, changed };
}
