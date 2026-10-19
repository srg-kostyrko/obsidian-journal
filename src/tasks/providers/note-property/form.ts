// Storage stays permissive (slice.ts falls back per field); this schema is stricter and is parsed
// only against the settings modal's in-memory draft, never against anything read from the slice.
import * as v from "valibot";

import { m } from "@/i18n";
import type { TaskDateRole } from "@/tasks";

import type { NotePropertySliceState } from "./slice";

export const NOTE_PROPERTY_DATE_ROLES: readonly TaskDateRole[] = ["due", "scheduled", "start", "done", "created"];

export interface StatusValueRow {
  id: number;
  value: string;
  status: string;
}

export interface NotePropertyDraft {
  by: "tag" | "property";
  tag: string;
  propertyName: string;
  propertyValue: string;
  excludedFolders: string[];
  archiveTag: string;
  dates: Record<TaskDateRole, string>;
  statusProperty: string;
  statusRows: StatusValueRow[];
  // Keyed by row id, not by value: a value is edited in place, and a mark keyed by its text would
  // fall off the row on the first keystroke.
  canonical: Record<string, number>;
  titleProperty: string;
  modifiedProperty: string;
  recurrenceProperties: string;
}

export type NotePropertyFormField = "tag" | "propertyName" | "statusProperty" | "statusRows";

// The reader matches tags in the "#"-prefixed form getAllTags returns, so a tag typed without one
// would never match a note.
export function normalizeTag(text: string): string {
  const bare = text.trim().replace(/^#+/u, "");
  return bare === "" ? "" : `#${bare}`;
}

function statusKey(value: string): string {
  return value.trim().toLowerCase();
}

export function draftFrom(state: NotePropertySliceState): NotePropertyDraft {
  const statusRows = Object.entries(state.statusMap).map(([value, status], id) => ({ id, value, status }));
  const canonical: Record<string, number> = {};
  for (const [type, value] of Object.entries(state.canonical)) {
    // A written-back value the map does not read back as its type would break every tick's round
    // trip; it has no row to mark, so it is dropped here and Save repairs it.
    const row = statusRows.find(
      (candidate) => candidate.status === type && statusKey(candidate.value) === statusKey(value),
    );
    if (row) canonical[type] = row.id;
  }
  return {
    by: state.identify.by,
    tag: state.identify.by === "tag" ? state.identify.tag : "",
    propertyName: state.identify.by === "property" ? state.identify.name : "",
    propertyValue: state.identify.by === "property" ? state.identify.value : "",
    excludedFolders: [...state.excludedFolders],
    archiveTag: state.archiveTag,
    dates: {
      due: state.dates.due ?? "",
      scheduled: state.dates.scheduled ?? "",
      start: state.dates.start ?? "",
      done: state.dates.done ?? "",
      created: state.dates.created ?? "",
    },
    statusProperty: state.statusProperty,
    statusRows,
    canonical,
    titleProperty: state.titleProperty,
    modifiedProperty: state.modifiedProperty,
    recurrenceProperties: state.recurrenceProperties.join(", "),
  };
}

export function stateFrom(draft: NotePropertyDraft): Omit<NotePropertySliceState, "enabled"> {
  const dates: NotePropertySliceState["dates"] = {};
  for (const role of NOTE_PROPERTY_DATE_ROLES) {
    const name = draft.dates[role].trim();
    if (name !== "") dates[role] = name;
  }
  const statusMap: Record<string, string> = {};
  for (const row of draft.statusRows) statusMap[statusKey(row.value)] = row.status;
  const canonical: Record<string, string> = {};
  for (const [type, id] of Object.entries(draft.canonical)) {
    const row = draft.statusRows.find((candidate) => candidate.id === id);
    if (row?.status === type) canonical[type] = statusKey(row.value);
  }
  return {
    identify:
      draft.by === "tag"
        ? { by: "tag", tag: normalizeTag(draft.tag) }
        : { by: "property", name: draft.propertyName.trim(), value: draft.propertyValue.trim() },
    excludedFolders: [
      ...new Set(draft.excludedFolders.map((folder) => folder.trim()).filter((folder) => folder !== "")),
    ],
    archiveTag: normalizeTag(draft.archiveTag),
    dates,
    statusProperty: draft.statusProperty.trim(),
    statusMap,
    canonical,
    titleProperty: draft.titleProperty.trim(),
    modifiedProperty: draft.modifiedProperty.trim(),
    recurrenceProperties: draft.recurrenceProperties
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  };
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const raw of values) {
    const value = statusKey(raw);
    if (value === "") continue;
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

// Built per call so m.*() is not evaluated at import time.
function buildNotePropertyFormSchema() {
  const propertyName = v.pipe(v.string(), v.trim(), v.nonEmpty(m.tasks_note_property_property_required()));
  return v.object({
    identify: v.variant("by", [
      v.object({
        by: v.literal("tag"),
        tag: v.pipe(
          v.string(),
          v.check((tag) => normalizeTag(tag) !== "", m.tasks_note_property_tag_required()),
        ),
      }),
      v.object({ by: v.literal("property"), name: propertyName }),
    ]),
    statusProperty: propertyName,
    statusRows: v.pipe(
      v.array(
        v.object({
          value: v.pipe(v.string(), v.trim(), v.nonEmpty(m.tasks_note_property_status_value_required())),
        }),
      ),
      v.check(
        (rows) => firstDuplicate(rows.map((row) => row.value)) === undefined,
        (issue) =>
          m.tasks_note_property_status_value_duplicate({
            value: firstDuplicate((issue.input as { value: string }[]).map((row) => row.value)) ?? "",
          }),
      ),
    ),
  });
}

export function notePropertyFormErrors(draft: NotePropertyDraft): Partial<Record<NotePropertyFormField, string[]>> {
  const result = v.safeParse(buildNotePropertyFormSchema(), {
    identify: draft.by === "tag" ? { by: "tag", tag: draft.tag } : { by: "property", name: draft.propertyName },
    statusProperty: draft.statusProperty,
    statusRows: draft.statusRows,
  });
  if (result.success) return {};
  const errors: Partial<Record<NotePropertyFormField, string[]>> = {};
  const add = (field: NotePropertyFormField, message: string): void => {
    const list = errors[field] ?? [];
    if (!list.includes(message)) list.push(message);
    errors[field] = list;
  };
  for (const issue of result.issues) {
    const root = (v.getDotPath(issue) ?? "").split(".", 1).at(0);
    if (root === "identify") add(draft.by === "tag" ? "tag" : "propertyName", issue.message);
    else if (root === "statusProperty" || root === "statusRows") add(root, issue.message);
  }
  return errors;
}
