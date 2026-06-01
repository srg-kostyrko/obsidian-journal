import type { Module } from "@/infrastructure/di";

import { AutoAttachService } from "./auto-attach";
import { AutoCreateService } from "./auto-create";
import { journalNotesFlowsModule } from "./flows/module";
import { NoteConnectionService } from "./note-connection";
import { NoteConnectionCommands } from "./note-connection-commands";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { TemplateContentService } from "./template-content";

export const journalNotesModule: Module = {
  register(c) {
    c.register(NotePathService).useClass(NotePathService);
    c.register(TemplateContentService).useClass(TemplateContentService);
    c.register(NoteCreationService).useClass(NoteCreationService);
    c.register(NoteConnectionService).useClass(NoteConnectionService);
    c.register(AutoAttachService).useClass(AutoAttachService).eager();
    c.register(AutoCreateService).useClass(AutoCreateService);
    journalNotesFlowsModule.register(c);
    c.register(NoteConnectionCommands).useClass(NoteConnectionCommands).eager();
  },
};
