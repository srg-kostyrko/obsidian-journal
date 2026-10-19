import { CalendarDate, type AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import type { TaskDateRole, TaskStatus } from "@/tasks";
import { isTaskStatus } from "@/tasks/status";

import { lowerScalars, scalarText, tagMatches } from "./scalars";

import type { NotePropertySliceState } from "./slice";

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?:$|[ T])/u;

export interface IdentifiableNote {
  // Frontmatter tags only: a body tag marks a passage of the note, not the note itself.
  readonly frontmatterTags: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}

export function identifiesNote(note: IdentifiableNote, path: VaultPath, state: NotePropertySliceState): boolean {
  if (state.excludedFolders.some((folder) => path.startsWith(`${folder.replace(/\/+$/u, "")}/`))) return false;
  const tags = note.frontmatterTags.map((tag) => tag.toLowerCase());
  const carries = (wanted: string) => tags.some((tag) => tagMatches(tag, wanted.toLowerCase()));
  if (state.archiveTag !== "" && carries(state.archiveTag)) return false;
  const rule = state.identify;
  if (rule.by === "tag") return carries(rule.tag);
  // `isTask:` with nothing after it is YAML null, and still a note that has the property.
  if (rule.value === "") return Object.hasOwn(note.properties, rule.name);
  return lowerScalars(note.properties[rule.name]).includes(rule.value.toLowerCase());
}

export function readDates(
  properties: Record<string, unknown>,
  dates: NotePropertySliceState["dates"],
): Partial<Record<TaskDateRole, AnchorString>> {
  const found: Partial<Record<TaskDateRole, AnchorString>> = {};
  for (const [role, name] of Object.entries(dates) as [TaskDateRole, string | undefined][]) {
    if (name === undefined) continue;
    const raw = properties[name];
    if (typeof raw !== "string" || !ISO_DATE_PREFIX.test(raw)) continue;
    const parsed = CalendarDate.parse(raw.slice(0, 10));
    if (parsed.isOk()) found[role] = parsed.value.toAnchor();
  }
  return found;
}

export function readStatus(properties: Record<string, unknown>, state: NotePropertySliceState): TaskStatus {
  const raw = properties[state.statusProperty];
  const key = scalarText(raw)?.toLowerCase();
  if (key === undefined) return "todo";
  const named = Object.entries(state.statusMap).find(([candidate]) => candidate.toLowerCase() === key)?.[1];
  return named !== undefined && isTaskStatus(named) ? named : "todo";
}

export function readTitle(properties: Record<string, unknown>, path: VaultPath, titleProperty: string): string {
  const raw = properties[titleProperty];
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return (path.split("/").at(-1) ?? path).replace(/\.md$/u, "");
}

export function isRecurring(properties: Record<string, unknown>, recurrenceProperties: readonly string[]): boolean {
  return recurrenceProperties.some((name) => {
    const value = properties[name];
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    return (scalarText(value) ?? "x").trim() !== "";
  });
}
