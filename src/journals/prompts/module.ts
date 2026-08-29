import type { Module } from "@/infrastructure/di";

import { GatherPromptAnswersFlow } from "./flows/gather-prompt-answers.flow";

export const promptsModule: Module = {
  register(c) {
    c.register(GatherPromptAnswersFlow).useClass(GatherPromptAnswersFlow);
  },
};
