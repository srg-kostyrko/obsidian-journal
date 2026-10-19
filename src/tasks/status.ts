import type { TaskStatus } from "./types";

// The full set a provider value may be mapped to, including rolled — assigned to no default symbol, but
// still a legitimate target for a user's own mapping (see normalize.test.ts). The status-map
// settings editors reuses this list rather than keeping its own, so the two cannot drift apart.
export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in-progress",
  "on-hold",
  "done",
  "cancelled",
  "non-task",
  "rolled",
];

const KNOWN = new Set<string>(TASK_STATUSES);

export function isTaskStatus(value: string): value is TaskStatus {
  return KNOWN.has(value);
}

const OPEN = new Set<TaskStatus>(["todo", "in-progress", "on-hold"]);
const DONE = new Set<TaskStatus>(["done", "cancelled"]);

// rolled is deliberately in neither alias: it is not open, which is the point of it,
// and it is not done.
export function isOpen(status: TaskStatus): boolean {
  return OPEN.has(status);
}

export function isDone(status: TaskStatus): boolean {
  return DONE.has(status);
}

export function isExcluded(status: TaskStatus): boolean {
  return status === "non-task";
}
