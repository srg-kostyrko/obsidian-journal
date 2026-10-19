// Storage stays permissive (visibility.ts drops what it cannot read); this schema is stricter and is
// parsed only against the journal modal's in-memory draft.
import { cloneFnJSON } from "@vueuse/core";
import * as v from "valibot";

import { m } from "@/i18n";
import { conditionValues } from "@/tasks/ui/condition-text";

import { DEFAULT_NOTE_VISIBILITY, type NoteVisibility, type VisibilityCondition } from "./visibility";

// Tags are one comma-separated field: a tag cannot hold a comma. Folders and property values are
// one input per entry, since either can.
export type VisibilityConditionDraft =
  | { id: number; type: "tag"; tags: string }
  | { id: number; type: "folder"; folders: string[] }
  | { id: number; type: "property"; name: string; values: string[] };

export interface VisibilityDraft {
  show: NoteVisibility["show"];
  mode: NoteVisibility["mode"];
  conditions: VisibilityConditionDraft[];
}

let nextId = 0;

export function emptyCondition(type: VisibilityCondition["type"]): VisibilityConditionDraft {
  nextId += 1;
  if (type === "tag") return { id: nextId, type, tags: "" };
  if (type === "folder") return { id: nextId, type, folders: [""] };
  return { id: nextId, type, name: "", values: [""] };
}

export function visibilityDraftFrom(stored: NoteVisibility | undefined): VisibilityDraft {
  // The stored rule is a reactive proxy into the journal config; the draft must share none of its
  // arrays, or an edit reaches the store before Save.
  const rule = cloneFnJSON(stored ?? DEFAULT_NOTE_VISIBILITY);
  return {
    show: rule.show,
    mode: rule.mode,
    conditions: rule.conditions.map((condition) => {
      nextId += 1;
      if (condition.type === "tag") return { id: nextId, type: "tag", tags: condition.tags.join(", ") };
      if (condition.type === "folder") return { id: nextId, type: "folder", folders: condition.folders };
      return { id: nextId, type: "property", name: condition.name, values: condition.values };
    }),
  };
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

// Vault paths are relative, so "/Projects" would never prefix one; "/" alone is the root, which
// cannot narrow.
function normalizeFolder(folder: string): string {
  return folder.trim().replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function conditionFrom(draft: VisibilityConditionDraft): VisibilityCondition {
  switch (draft.type) {
    case "tag": {
      // conditionValues drops a blank entry: a "" tag matches no note, so under "and" it would hide
      // every task note.
      return { type: "tag", tags: distinct(conditionValues(draft.tags, "tag")) };
    }
    case "folder": {
      return {
        type: "folder",
        folders: distinct(draft.folders.map(normalizeFolder).filter((folder) => folder !== "")),
      };
    }
    case "property": {
      const values = draft.values.map((value) => value.trim()).filter((value) => value !== "");
      return { type: "property", name: draft.name.trim(), values: distinct(values) };
    }
  }
}

function isNoOp(condition: VisibilityCondition): boolean {
  if (condition.type === "tag") return condition.tags.length === 0;
  if (condition.type === "folder") return condition.folders.length === 0;
  return condition.name === "" || condition.values.length === 0;
}

// undefined for the default: a journal opened and saved untouched gains no key.
export function visibilityFrom(draft: VisibilityDraft): NoteVisibility | undefined {
  // Under All or None the form does not validate conditions, so an unfinished row is dropped
  // rather than stored; the finished ones stay, ready for a switch back to Matching.
  const conditions = draft.conditions.map(conditionFrom).filter((condition) => !isNoOp(condition));
  if (draft.show === "all" && conditions.length === 0) return undefined;
  return { show: draft.show, mode: draft.mode, conditions };
}

// Built per call so m.*() is not evaluated at import time.
function buildConditionSchema() {
  const values = v.pipe(v.array(v.string()), v.minLength(1, m.tasks_condition_values_required()));
  return v.variant("type", [
    v.object({ type: v.literal("tag"), tags: values }),
    v.object({ type: v.literal("folder"), folders: values }),
    v.object({
      type: v.literal("property"),
      name: v.pipe(v.string(), v.nonEmpty(m.tasks_note_property_property_required())),
      values,
    }),
  ]);
}

// Keyed by the draft row's id, so a message stays on its row when an earlier one is removed.
export function visibilityFormErrors(draft: VisibilityDraft): ReadonlyMap<number, string[]> {
  const errors = new Map<number, string[]>();
  if (draft.show !== "matching") return errors;
  const schema = buildConditionSchema();
  for (const condition of draft.conditions) {
    const result = v.safeParse(schema, conditionFrom(condition));
    if (!result.success) errors.set(condition.id, distinct(result.issues.map((issue) => issue.message)));
  }
  return errors;
}
