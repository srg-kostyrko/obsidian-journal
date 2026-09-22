import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";

import TasksBlock from "./ui/TasksBlock.vue";

export const tasksUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(defineDashboardBlock({ key: "tasks", component: TasksBlock, order: 12 }));
  },
};
