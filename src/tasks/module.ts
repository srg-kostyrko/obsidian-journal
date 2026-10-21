import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { moveDefaultsSlice } from "./move/settings";
import { TaskProviderRegistry } from "./provider-registry";
import { EditCheckboxProviderFlow } from "./providers/checkbox/flows/edit-checkbox-provider.flow";
import { EditJournalTasksFlow } from "./providers/checkbox/flows/edit-journal-tasks.flow";
import { CheckboxTaskProvider } from "./providers/checkbox/provider";
import { checkboxSlice } from "./providers/checkbox/slice";
import { EditJournalTaskNotesFlow } from "./providers/note-property/flows/edit-journal-task-notes.flow";
import { EditNotePropertyProviderFlow } from "./providers/note-property/flows/edit-note-property-provider.flow";
import { NotePropertyTaskProvider } from "./providers/note-property/provider";
import { notePropertySlice } from "./providers/note-property/slice";
import { SetUpFromTaskNotesFlow } from "./providers/note-property/tasknotes/flows/set-up-from-tasknotes.flow";
import { taskNotesNoticeSlice } from "./providers/note-property/tasknotes/slice";
import { TaskNotesSource } from "./providers/note-property/tasknotes/source";
import { NotePropertyTicker } from "./providers/note-property/tick";
import { TaskHostService } from "./task-host";
import { TaskIndex } from "./task-index";
import { TickService } from "./tick";
import { TaskHostToken, TaskProviderToken } from "./types";
import { tasksUiModule } from "./ui-module";
import { TaskVisibility } from "./visibility";

export const tasksCoreModule: Module = {
  register(c) {
    c.register(TaskIndex).useClass(TaskIndex);
    c.register(TaskHostToken).useClass(TaskHostService);
    c.register(TaskProviderRegistry).useClass(TaskProviderRegistry);
    c.register(TaskProviderToken).useClass(CheckboxTaskProvider);
    c.register(TaskProviderToken).useClass(NotePropertyTaskProvider);
    c.register(SliceDefinitionToken).useValue(checkboxSlice);
    c.register(SliceDefinitionToken).useValue(moveDefaultsSlice);
    c.register(SliceDefinitionToken).useValue(notePropertySlice);
    c.register(SliceDefinitionToken).useValue(taskNotesNoticeSlice);
    c.register(EditCheckboxProviderFlow).useClass(EditCheckboxProviderFlow);
    c.register(EditJournalTasksFlow).useClass(EditJournalTasksFlow);
    c.register(EditNotePropertyProviderFlow).useClass(EditNotePropertyProviderFlow);
    c.register(EditJournalTaskNotesFlow).useClass(EditJournalTaskNotesFlow);
    c.register(TaskNotesSource).useClass(TaskNotesSource);
    c.register(SetUpFromTaskNotesFlow).useClass(SetUpFromTaskNotesFlow);
    c.register(NotePropertyTicker).useClass(NotePropertyTicker);
    c.register(TaskVisibility).useClass(TaskVisibility);
    c.register(TickService).useClass(TickService);
  },
};

export const tasksModule: Module = {
  register(c) {
    tasksCoreModule.register(c);
    tasksUiModule.register(c);
  },
};
