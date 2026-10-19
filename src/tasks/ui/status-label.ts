import { match } from "ts-pattern";

import { m } from "@/i18n";

// Every status name is a full phrase from the message catalogue, never the bare TaskStatus
// identifier — an identifier spliced into a sentence survives translation unchanged and cannot
// agree with the surrounding phrase in a gendered locale. Accepts a plain string (not narrowed to
// TaskStatus) because a stored status-map value is schema-checked only as "some string", the same
// reason normalizeStatus falls back to todo for a name it doesn't recognize rather than throwing.
export function taskStatusLabel(status: string): string {
  return match(status)
    .with("todo", () => m.tasks_status_todo())
    .with("done", () => m.tasks_status_done())
    .with("in-progress", () => m.tasks_status_in_progress())
    .with("cancelled", () => m.tasks_status_cancelled())
    .with("on-hold", () => m.tasks_status_on_hold())
    .with("non-task", () => m.tasks_status_non_task())
    .with("rolled", () => m.tasks_status_rolled())
    .otherwise(() => m.tasks_status_todo());
}
