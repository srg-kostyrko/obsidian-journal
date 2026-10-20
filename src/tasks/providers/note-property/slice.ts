import * as v from "valibot";

import { defineSlice } from "@/settings";
import { climb } from "@/settings/repair";
import type { TaskDateRole } from "@/tasks";

export const NOTE_PROPERTY_PROVIDER_ID = "note-property";

const identifies = "a default identifies different notes as tasks";

const identifySchema = v.variant("by", [
  v.object({ by: v.pipe(v.literal("tag"), climb("discriminant")), tag: v.pipe(v.string(), climb(identifies)) }),
  v.object({
    by: v.pipe(v.literal("property"), climb("discriminant")),
    name: v.pipe(v.string(), climb(identifies)),
    value: v.pipe(v.string(), climb(identifies)),
  }),
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

export const notePropertySliceSchema = v.object({
  enabled: v.optional(v.boolean(), false),
  // Whether the provider has ever been enabled, for onboarding that must not reappear once it has.
  setUp: v.optional(v.boolean(), false),
  identify: v.optional(identifySchema, DEFAULT_IDENTIFY),
  excludedFolders: v.optional(v.array(v.string()), []),
  archiveTag: v.optional(v.string(), "#archived"),
  dates: v.optional(
    v.object({
      due: v.optional(v.string()),
      scheduled: v.optional(v.string()),
      start: v.optional(v.string()),
      done: v.optional(v.string()),
      created: v.optional(v.string()),
    }),
    DEFAULT_DATES,
  ),
  statusProperty: v.optional(v.string(), "status"),
  statusMap: v.optional(stringRecord, DEFAULT_STATUS_MAP),
  canonical: v.optional(stringRecord, DEFAULT_CANONICAL),
  titleProperty: v.optional(v.string(), "title"),
  modifiedProperty: v.optional(v.string(), "dateModified"),
  // The deep repair empties a list whose only entry is unreadable, which would switch off the
  // recurring-task guard in tick.ts; the defaults keep it on.
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
    setUp: false,
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
