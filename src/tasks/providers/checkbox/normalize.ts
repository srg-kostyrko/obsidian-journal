import type { TaskStatus } from "@/tasks";

const KNOWN = new Set<string>(["todo", "done", "in-progress", "cancelled", "on-hold", "non-task", "rolled"]);

export function normalizeStatus(marker: string, map: Record<string, string>): TaskStatus {
  const named = map[marker];
  return named !== undefined && KNOWN.has(named) ? (named as TaskStatus) : "todo";
}
