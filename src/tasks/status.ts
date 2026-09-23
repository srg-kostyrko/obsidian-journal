import type { TaskStatus } from "./types";

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
