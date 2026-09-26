import { match } from "ts-pattern";

import { m } from "@/i18n";

// The three names STATUS_ALIASES (conditions.ts) already gives meaning to — the same vocabulary
// the journal-tasks fence's `status:` key and the view block's own default ("open") document, so
// picking one of these three buttons writes exactly the string a user reading those docs already
// expects. A per-canonical-status picker would let the UI express combinations STATUS_ALIASES has
// no name for, at the cost of the one-click "just show me what's still open" case a listing
// filter's status condition exists for.
export const STATUS_FILTER_OPTIONS = ["open", "done", "all"] as const;

// Accepts a plain string, not a narrowed union: a stored `statuses` entry is schema-checked only
// as "some string" (the fence's `status:` key and hand-edited data can carry a bare canonical
// status name, not just one of the three groups above), so this also names every canonical
// TaskStatus for the sake of describing a value the editor itself never writes. Falls back to the
// raw string rather than throwing — the same degrade StatusMapEditor's normalizeStatus uses for a
// name it doesn't recognize.
export function statusFilterLabel(status: string): string {
  return match(status)
    .with("open", () => m.tasks_status_group_open())
    .with("done", () => m.tasks_status_group_done())
    .with("all", () => m.tasks_status_group_all())
    .with("todo", () => m.tasks_status_todo())
    .with("in-progress", () => m.tasks_status_in_progress())
    .with("on-hold", () => m.tasks_status_on_hold())
    .with("cancelled", () => m.tasks_status_cancelled())
    .with("rolled", () => m.tasks_status_rolled())
    .otherwise(() => status);
}
