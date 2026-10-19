import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { PluginSettingsReader } from "@/infrastructure/host";

import { bareTag } from "./bare-tag";

const text = (fallback: string) => v.optional(v.string(), fallback);

const customStatusSchema = v.object({
  value: v.string(),
  isCompleted: v.optional(v.boolean(), false),
  order: v.optional(v.number(), 0),
});

const fieldMappingSchema = v.object({
  status: text("status"),
  due: text("due"),
  scheduled: text("scheduled"),
  title: text("title"),
  completedDate: text("completedDate"),
  dateCreated: text("dateCreated"),
  dateModified: text("dateModified"),
  recurrence: text("recurrence"),
  recurrenceParent: text("recurrence_parent"),
  archiveTag: text("archived"),
});

const DEFAULT_CUSTOM_STATUSES = [
  { value: "none", isCompleted: false, order: 0 },
  { value: "open", isCompleted: false, order: 1 },
  { value: "in-progress", isCompleted: false, order: 2 },
  { value: "done", isCompleted: true, order: 3 },
];

// Every field is optional with TaskNotes' own default; only a wrong-typed value makes the read unrecognised.
export const taskNotesSettingsSchema = v.object({
  taskIdentificationMethod: v.optional(v.picklist(["tag", "property"]), "tag"),
  taskTag: text("task"),
  taskPropertyName: text(""),
  taskPropertyValue: text(""),
  // TaskNotes' own reader takes a comma-separated string or a list.
  excludedFolders: v.optional(v.union([v.string(), v.array(v.string())]), ""),
  defaultTaskStatus: text("open"),
  fieldMapping: v.optional(fieldMappingSchema, {}),
  customStatuses: v.optional(v.array(customStatusSchema), DEFAULT_CUSTOM_STATUSES),
});

export type TaskNotesSettings = v.InferOutput<typeof taskNotesSettingsSchema>;

export type TaskNotesRead =
  { kind: "absent" } | { kind: "unrecognised" } | { kind: "read"; settings: TaskNotesSettings };

// A copy that matches no note is worse than no card, so an empty identifier is unreadable. TaskNotes
// itself identifies nothing by a property rule missing either its name or its value.
function identifiesSomething(settings: TaskNotesSettings): boolean {
  if (settings.taskIdentificationMethod === "property") {
    return settings.taskPropertyName.trim() !== "" && settings.taskPropertyValue.trim() !== "";
  }
  return bareTag(settings.taskTag) !== "";
}

export class TaskNotesSource {
  readonly #reader = inject(PluginSettingsReader);

  read(): TaskNotesRead {
    const plugin = this.#reader.communityPlugin("tasknotes");
    if (plugin.isNone()) return { kind: "absent" };
    // Foreign code: a getter or proxy trap on the live object may throw, and safeParse does not catch that.
    try {
      const parsed = v.safeParse(taskNotesSettingsSchema, (plugin.value as { settings?: unknown }).settings);
      if (!parsed.success || !identifiesSomething(parsed.output)) return { kind: "unrecognised" };
      return { kind: "read", settings: parsed.output };
    } catch {
      return { kind: "unrecognised" };
    }
  }
}
