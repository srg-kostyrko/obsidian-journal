import { bareTag } from "./bare-tag";

import type { NotePropertySliceState } from "../slice";
import type { TaskNotesSettings } from "./source";

type Canonical = "todo" | "in-progress" | "done";

function typeOf(status: { value: string; isCompleted: boolean }): Canonical {
  if (status.isCompleted) return "done";
  return status.value.toLowerCase() === "in-progress" ? "in-progress" : "todo";
}

function folders(raw: string | readonly string[]): string[] {
  const entries = typeof raw === "string" ? raw.split(",") : raw;
  return entries
    .map((folder) =>
      folder
        .trim()
        .replaceAll("\\", "/")
        .replaceAll(/^\/+|\/+$/g, ""),
    )
    .filter((folder) => folder !== "");
}

function trimmedFields(fields: TaskNotesSettings["fieldMapping"]): TaskNotesSettings["fieldMapping"] {
  return Object.fromEntries(
    Object.entries(fields).map(([key, name]) => [key, name.trim()]),
  ) as TaskNotesSettings["fieldMapping"];
}

export function fromTaskNotes(settings: TaskNotesSettings): Partial<NotePropertySliceState> {
  const fields = trimmedFields(settings.fieldMapping);
  const trimmed = settings.customStatuses.map((status) => ({ ...status, value: status.value.trim() }));
  const statuses = trimmed.toSorted((a, b) => a.order - b.order);

  const statusMap: Record<string, string> = {};
  for (const status of trimmed) statusMap[status.value.toLowerCase()] = typeOf(status);

  const defaultStatus = statuses.find((status) => status.value === settings.defaultTaskStatus.trim());
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
        ? { by: "property", name: settings.taskPropertyName.trim(), value: settings.taskPropertyValue.trim() }
        : { by: "tag", tag: `#${bareTag(settings.taskTag)}` },
    excludedFolders: folders(settings.excludedFolders),
    archiveTag: bareTag(fields.archiveTag) === "" ? "" : `#${bareTag(fields.archiveTag)}`,
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
