import { defineCodeBlock } from "@/infrastructure/host";

import { tasksBlockKeys, tasksBlockSchema } from "./tasks-config";
import TasksCodeBlock from "./ui/TasksCodeBlock.vue";

export const tasksCodeBlock = defineCodeBlock({
  keys: ["journal-tasks"],
  schema: tasksBlockSchema,
  component: TasksCodeBlock,
  cssClass: ["journal-tasks-code-block"],
  knownKeys: tasksBlockKeys,
});
