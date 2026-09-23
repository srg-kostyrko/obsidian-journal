import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";

import JournalTasksBlock from "./ui/JournalTasksBlock.vue";
import TasksBlock from "./ui/TasksBlock.vue";

export const tasksUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(defineDashboardBlock({ key: "tasks", component: TasksBlock, order: 12 }));
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "tasks", order: 110, component: JournalTasksBlock }),
    );
  },
};
