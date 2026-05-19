import type { Module } from "@/infrastructure/di";

import { OpenDateFlow } from "./open-date";
import { OpenJournalEntryFlow } from "./open-journal-entry";

export const journalFlowsModule: Module = {
  register(c) {
    c.register(OpenDateFlow).useClass(OpenDateFlow);
    c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  },
};
