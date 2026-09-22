import type { AnchorString } from "@/calendar";
import type { TaskDateRole } from "@/tasks";

const SIGNIFIERS: readonly (readonly [TaskDateRole, RegExp])[] = [
  ["created", /➕\s*(\d{4}-\d{2}-\d{2})/u],
  ["start", /🛫\s*(\d{4}-\d{2}-\d{2})/u],
  ["scheduled", /[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/u],
  ["due", /(?:📅|📆|🗓️?)\s*(\d{4}-\d{2}-\d{2})/u],
  ["done", /✅\s*(\d{4}-\d{2}-\d{2})/u],
];

export function datesIn(markdown: string): Partial<Record<TaskDateRole, AnchorString>> {
  const found: Partial<Record<TaskDateRole, AnchorString>> = {};
  for (const [role, pattern] of SIGNIFIERS) {
    const hit = pattern.exec(markdown);
    const value = hit?.at(1);
    if (value !== undefined) found[role] = value as AnchorString;
  }
  return found;
}
