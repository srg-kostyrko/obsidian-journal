import type { TaskStatus } from "@/tasks";

// The full set a symbol may be mapped to, including rolled — assigned to no default symbol, but
// still a legitimate target for a user's own mapping (see normalize.test.ts). The status-map
// settings editor reuses this list rather than keeping its own, so the two cannot drift apart.
export const CHECKBOX_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in-progress",
  "on-hold",
  "done",
  "cancelled",
  "non-task",
  "rolled",
];

const KNOWN = new Set<string>(CHECKBOX_STATUSES);

export function normalizeStatus(marker: string, map: Record<string, string>): TaskStatus {
  const named = map[marker];
  return named !== undefined && KNOWN.has(named) ? (named as TaskStatus) : "todo";
}
