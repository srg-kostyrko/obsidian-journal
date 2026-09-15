import type { ImportPlan } from "./planner";
import type { SourceId } from "./source";

export interface ImportOffer {
  readonly sources: readonly SourceId[];
  readonly count: number;
}

/** What the dashboard notice offers: new journals from sources the user actually set up. */
export function importOffer(plan: ImportPlan): ImportOffer {
  const configured = new Set(plan.readings.filter((reading) => reading.configured).map((reading) => reading.source));
  const rows = plan.rows.filter((row) => row.state.kind === "new" && configured.has(row.journal.source));
  return { sources: [...new Set(rows.map((row) => row.journal.source))], count: rows.length };
}
