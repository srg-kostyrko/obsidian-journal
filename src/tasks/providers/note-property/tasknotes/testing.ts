import type { TaskNotesSettings } from "./source";

/** A plugin object carrying TaskNotes 4.13.9's settings fields we read, at its defaults. */
export function buildTaskNotesSettings(overrides: Partial<TaskNotesSettings> = {}): TaskNotesSettings {
  return {
    taskIdentificationMethod: "tag",
    taskTag: "task",
    taskPropertyName: "",
    taskPropertyValue: "",
    excludedFolders: "",
    defaultTaskStatus: "open",
    fieldMapping: {
      status: "status",
      due: "due",
      scheduled: "scheduled",
      title: "title",
      completedDate: "completedDate",
      dateCreated: "dateCreated",
      dateModified: "dateModified",
      recurrence: "recurrence",
      recurrenceParent: "recurrence_parent",
      archiveTag: "archived",
    },
    customStatuses: [
      { value: "none", isCompleted: false, order: 0 },
      { value: "open", isCompleted: false, order: 1 },
      { value: "in-progress", isCompleted: false, order: 2 },
      { value: "done", isCompleted: true, order: 3 },
    ],
    ...overrides,
  };
}

export function taskNotesPlugin(settings: unknown): { settings: unknown } {
  return { settings };
}
