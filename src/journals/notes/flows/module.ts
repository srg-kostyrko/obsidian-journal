import type { Module } from "@/infrastructure/di";

import { ConnectNoteFlow } from "./connect-note.flow";
import { InsertJournalLinkFlow } from "./insert-journal-link.flow";

export const journalNotesFlowsModule: Module = {
  register(c) {
    c.register(ConnectNoteFlow).useClass(ConnectNoteFlow);
    c.register(InsertJournalLinkFlow).useClass(InsertJournalLinkFlow);
  },
};
