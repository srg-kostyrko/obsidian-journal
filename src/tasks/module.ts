import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { TaskProviderRegistry } from "./provider-registry";
import { CheckboxTaskProvider } from "./providers/checkbox/provider";
import { checkboxSlice } from "./providers/checkbox/slice";
import { TaskHostService } from "./task-host";
import { TaskIndex } from "./task-index";
import { TaskHostToken, TaskProviderToken } from "./types";

export const tasksCoreModule: Module = {
  register(c) {
    c.register(TaskIndex).useClass(TaskIndex);
    c.register(TaskHostToken).useClass(TaskHostService);
    c.register(TaskProviderRegistry).useClass(TaskProviderRegistry);
    c.register(TaskProviderToken).useClass(CheckboxTaskProvider);
    c.register(SliceDefinitionToken).useValue(checkboxSlice);
  },
};

// Task 14 adds tasksUiModule and folds it in here alongside tasksCoreModule; until then
// tasksModule IS tasksCoreModule, so a consumer that only knows tasksModule already gets the
// real wiring.
export const tasksModule: Module = tasksCoreModule;
