import type { Module } from "@/infrastructure/di";

import { TaskIndex } from "./task-index";

export const tasksCoreModule: Module = {
  register(c) {
    c.register(TaskIndex).useClass(TaskIndex);
  },
};
