import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { TaskProviderRegistry } from "./provider-registry";
import { CheckboxTaskProvider } from "./providers/checkbox/provider";
import { checkboxSlice } from "./providers/checkbox/slice";
import { TaskHostService } from "./task-host";
import { TaskIndex } from "./task-index";
import { TaskHostToken, TaskProviderToken } from "./types";
import { tasksUiModule } from "./ui-module";

export const tasksCoreModule: Module = {
  register(c) {
    c.register(TaskIndex).useClass(TaskIndex);
    c.register(TaskHostToken).useClass(TaskHostService);
    c.register(TaskProviderRegistry).useClass(TaskProviderRegistry);
    c.register(TaskProviderToken).useClass(CheckboxTaskProvider);
    c.register(SliceDefinitionToken).useValue(checkboxSlice);
  },
};

export const tasksModule: Module = {
  register(c) {
    tasksCoreModule.register(c);
    tasksUiModule.register(c);
  },
};
