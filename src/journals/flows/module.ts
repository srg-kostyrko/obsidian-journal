import type { Module } from "@/infrastructure/di";

import { JournalDateResolver } from "./journal-date-resolver";
import { OpenDateFlow } from "./open-date.flow";
import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

export const journalFlowsModule: Module = {
  register(c) {
    c.register(JournalDateResolver).useClass(JournalDateResolver);
    c.register(OpenDateFlow).useClass(OpenDateFlow);
    c.register(OpenJournalEntryFlow).useClass(OpenJournalEntryFlow);
  },
};
