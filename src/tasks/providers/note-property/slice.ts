import * as v from "valibot";

import { defineSlice } from "@/settings";
import type { TaskDateRole } from "@/tasks";

export const NOTE_PROPERTY_PROVIDER_ID = "note-property";

const identifySchema = v.variant("by", [
  v.object({ by: v.literal("tag"), tag: v.string() }),
  v.object({ by: v.literal("property"), name: v.string(), value: v.string() }),
]);

const stringRecord = v.record(v.string(), v.string());

export const DEFAULT_IDENTIFY: v.InferOutput<typeof identifySchema> = { by: "tag", tag: "#task" };
export const DEFAULT_DATES: Partial<Record<TaskDateRole, string>> = {
  due: "due",
  scheduled: "scheduled",
  done: "completedDate",
  created: "dateCreated",
};
export const DEFAULT_STATUS_MAP: Record<string, string> = {
  none: "todo",
  open: "todo",
  "in-progress": "in-progress",
  done: "done",
};
export const DEFAULT_CANONICAL: Record<string, string> = {
  todo: "open",
  done: "done",
  "in-progress": "in-progress",
};
export const DEFAULT_RECURRENCE_PROPERTIES: string[] = ["recurrence", "recurrence_parent"];

// Each field wraps its schema in v.fallback so a malformed value resets that field alone, not the slice.
export const notePropertySliceSchema = v.object({
  enabled: v.optional(v.fallback(v.boolean(), false), false),
  identify: v.optional(v.fallback(identifySchema, DEFAULT_IDENTIFY), DEFAULT_IDENTIFY),
  excludedFolders: v.optional(v.fallback(v.array(v.string()), []), []),
  archiveTag: v.optional(v.fallback(v.string(), "#archived"), "#archived"),
  dates: v.optional(
    v.fallback(
      v.object({
        due: v.optional(v.string()),
        scheduled: v.optional(v.string()),
        start: v.optional(v.string()),
        done: v.optional(v.string()),
        created: v.optional(v.string()),
      }),
      DEFAULT_DATES,
    ),
    DEFAULT_DATES,
  ),
  statusProperty: v.optional(v.fallback(v.string(), "status"), "status"),
  statusMap: v.optional(v.fallback(stringRecord, DEFAULT_STATUS_MAP), DEFAULT_STATUS_MAP),
  canonical: v.optional(v.fallback(stringRecord, DEFAULT_CANONICAL), DEFAULT_CANONICAL),
  titleProperty: v.optional(v.fallback(v.string(), "title"), "title"),
  modifiedProperty: v.optional(v.fallback(v.string(), "dateModified"), "dateModified"),
  recurrenceProperties: v.optional(
    v.fallback(v.array(v.string()), DEFAULT_RECURRENCE_PROPERTIES),
    DEFAULT_RECURRENCE_PROPERTIES,
  ),
});

export type NotePropertySliceState = v.InferOutput<typeof notePropertySliceSchema>;

export const notePropertySlice = defineSlice<"tasksNoteProperty", typeof notePropertySliceSchema>(
  "tasksNoteProperty",
  notePropertySliceSchema,
  {
    enabled: false,
    identify: DEFAULT_IDENTIFY,
    excludedFolders: [],
    archiveTag: "#archived",
    dates: DEFAULT_DATES,
    statusProperty: "status",
    statusMap: DEFAULT_STATUS_MAP,
    canonical: DEFAULT_CANONICAL,
    titleProperty: "title",
    modifiedProperty: "dateModified",
    recurrenceProperties: DEFAULT_RECURRENCE_PROPERTIES,
  },
);
