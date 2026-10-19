import type { TaskStatus } from "@/tasks";
import { isTaskStatus } from "@/tasks/status";

export function normalizeStatus(marker: string, map: Record<string, string>): TaskStatus {
  const named = map[marker];
  return named !== undefined && isTaskStatus(named) ? named : "todo";
}
