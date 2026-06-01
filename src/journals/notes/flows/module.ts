import type { Module } from "@/infrastructure/di";

import { ConnectNoteFlow } from "./connect-note.flow";

export const journalNotesFlowsModule: Module = {
  register(c) {
    c.register(ConnectNoteFlow).useClass(ConnectNoteFlow);
  },
};
