// Deliberately no `./module` re-export, so this barrel stays safe to import from anywhere:
// module.ts constructs TaskHostService, which imports "@/journals", and @/journals reaches back
// into @/decorations (bulk-add-service.ts -> decorations/engine-checks.ts, which imports from
// here). Re-exporting the modules puts that whole path behind a type import that happens to
// erase today and closes a runtime cycle the first time a value is imported. The DI modules live
// at "@/tasks/module".
export type {
  TaskStatus,
  TaskDateRole,
  TaskRelation,
  TaskCapabilities,
  TaskDisplay,
  TaskItem,
  TaskProvider,
  OwnedNote,
  OwnedNoteChange,
  TaskHost,
} from "./types";
export { TaskProviderToken, TaskHostToken } from "./types";
export { isOpen, isDone, isExcluded } from "./status";
export { TaskProviderRegistry } from "./provider-registry";
export { TaskIndex } from "./task-index";
