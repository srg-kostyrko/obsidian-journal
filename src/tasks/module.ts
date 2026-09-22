import type { Module } from "@/infrastructure/di";

import { TaskHostService } from "./task-host";
import { TaskIndex } from "./task-index";
import { TaskHostToken } from "./types";

export const tasksCoreModule: Module = {
  register(c) {
    c.register(TaskIndex).useClass(TaskIndex);
    c.register(TaskHostToken).useClass(TaskHostService);
  },
};
