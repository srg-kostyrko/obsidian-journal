import type { NotePropertySliceState } from "../slice";
import type { TaskNotesSettings } from "./source";

type Canonical = "todo" | "in-progress" | "done";

function stripHash(tag: string): string {
  return tag.replace(/^#/, "");
}

function typeOf(status: { value: string; isCompleted: boolean }): Canonical {
  if (status.isCompleted) return "done";
  return status.value.toLowerCase() === "in-progress" ? "in-progress" : "todo";
}

function folders(raw: string): string[] {
  return raw
    .split(",")
    .map((folder) => folder.trim().replaceAll(/^\/+|\/+$/g, ""))
    .filter((folder) => folder !== "");
}

export function fromTaskNotes(settings: TaskNotesSettings): Partial<NotePropertySliceState> {
  const { fieldMapping: fields } = settings;
  const statuses = settings.customStatuses.toSorted((a, b) => a.order - b.order);

  const statusMap: Record<string, string> = {};
  for (const status of settings.customStatuses) statusMap[status.value.toLowerCase()] = typeOf(status);

  const defaultStatus = statuses.find((status) => status.value === settings.defaultTaskStatus);
  const todo =
    defaultStatus !== undefined && typeOf(defaultStatus) === "todo"
      ? defaultStatus
      : statuses.find((status) => typeOf(status) === "todo");
  const done = statuses.find((status) => typeOf(status) === "done");
  const inProgress = statuses.find((status) => typeOf(status) === "in-progress");

  const canonical: Record<string, string> = {};
  if (todo) canonical.todo = todo.value;
  if (done) canonical.done = done.value;
  if (inProgress) canonical["in-progress"] = inProgress.value;

  return {
    enabled: true,
    identify:
      settings.taskIdentificationMethod === "property"
        ? { by: "property", name: settings.taskPropertyName, value: settings.taskPropertyValue }
        : { by: "tag", tag: `#${stripHash(settings.taskTag)}` },
    excludedFolders: folders(settings.excludedFolders),
    archiveTag: fields.archiveTag === "" ? "" : `#${stripHash(fields.archiveTag)}`,
    dates: {
      due: fields.due,
      scheduled: fields.scheduled,
      done: fields.completedDate,
      created: fields.dateCreated,
    },
    statusProperty: fields.status,
    statusMap,
    canonical,
    titleProperty: fields.title,
    modifiedProperty: fields.dateModified,
    recurrenceProperties: [fields.recurrence, fields.recurrenceParent].filter((name) => name !== ""),
  };
}
