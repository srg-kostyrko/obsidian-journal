import type { AnchorString } from "@/calendar";
import type { TaskDateRole } from "@/tasks";

// (?!\d) after the date rejects a malformed token like "2026-09-251" instead of truncating it to
// the valid-looking prefix "2026-09-25" — these dates will eventually drive a retarget rewrite, so
// a parse that quietly accepts a malformed date is how the wrong bytes get written back.
const SIGNIFIERS: readonly (readonly [TaskDateRole, RegExp])[] = [
  ["created", /➕\s*(\d{4}-\d{2}-\d{2})(?!\d)/u],
  ["start", /🛫\s*(\d{4}-\d{2}-\d{2})(?!\d)/u],
  ["scheduled", /[⏳⌛]\s*(\d{4}-\d{2}-\d{2})(?!\d)/u],
  ["due", /(?:📅|📆|🗓️?)\s*(\d{4}-\d{2}-\d{2})(?!\d)/u],
  ["done", /✅\s*(\d{4}-\d{2}-\d{2})(?!\d)/u],
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
