import type { Module } from "@/infrastructure/di";

import { GatherPromptAnswersFlow } from "./flows/gather-prompt-answers.flow";
import { JournalNoteLinkPicker } from "./journal-note-link";

export const promptsModule: Module = {
  register(c) {
    c.register(GatherPromptAnswersFlow).useClass(GatherPromptAnswersFlow);
    c.register(JournalNoteLinkPicker).useClass(JournalNoteLinkPicker);
  },
};
