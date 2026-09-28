import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { TaskProviderRegistry } from "./provider-registry";
import { EditCheckboxProviderFlow } from "./providers/checkbox/flows/edit-checkbox-provider.flow";
import { EditJournalTasksFlow } from "./providers/checkbox/flows/edit-journal-tasks.flow";
import { CheckboxTaskProvider } from "./providers/checkbox/provider";
import { checkboxSlice } from "./providers/checkbox/slice";
import { TaskHostService } from "./task-host";
import { TaskIndex } from "./task-index";
import { TickService } from "./tick";
import { TaskHostToken, TaskProviderToken } from "./types";
import { tasksUiModule } from "./ui-module";

export const tasksCoreModule: Module = {
  register(c) {
    c.register(TaskIndex).useClass(TaskIndex);
    c.register(TaskHostToken).useClass(TaskHostService);
    c.register(TaskProviderRegistry).useClass(TaskProviderRegistry);
    c.register(TaskProviderToken).useClass(CheckboxTaskProvider);
    c.register(SliceDefinitionToken).useValue(checkboxSlice);
    c.register(EditCheckboxProviderFlow).useClass(EditCheckboxProviderFlow);
    c.register(EditJournalTasksFlow).useClass(EditJournalTasksFlow);
    c.register(TickService).useClass(TickService);
  },
};

export const tasksModule: Module = {
  register(c) {
    tasksCoreModule.register(c);
    tasksUiModule.register(c);
  },
};
