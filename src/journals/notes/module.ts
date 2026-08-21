import type { Module } from "@/infrastructure/di";
import { FunctionHandlerToken } from "@/templates";

import { AutoAttachService } from "./auto-attach";
import { AutoCreateService } from "./auto-create";
import { bulkAddModule } from "./bulk-add/module";
import { journalNotesFlowsModule } from "./flows/module";
import { JournalLinkCommands } from "./journal-link-commands";
import { JournalLinkHandler } from "./journal-link-handler";
import { NoteConnectionService } from "./note-connection";
import { NoteConnectionCommands } from "./note-connection-commands";
import { NoteCreationService } from "./note-creation";
import { NotePathService } from "./note-path";
import { SelfWriteGuard } from "./self-write-guard";
import { TemplateContentService } from "./template-content";

export const journalNotesCoreModule: Module = {
  register(c) {
    c.register(NotePathService).useClass(NotePathService);
    c.register(FunctionHandlerToken).useClass(JournalLinkHandler);
    c.register(TemplateContentService).useClass(TemplateContentService);
    c.register(SelfWriteGuard).useClass(SelfWriteGuard);
    c.register(NoteCreationService).useClass(NoteCreationService);
    c.register(NoteConnectionService).useClass(NoteConnectionService);
    c.register(AutoAttachService).useClass(AutoAttachService).eager();
    c.register(AutoCreateService).useClass(AutoCreateService);
    journalNotesFlowsModule.register(c);
    bulkAddModule.register(c);
  },
};

export const journalNotesStartupModule: Module = {
  register(c) {
    c.register(NoteConnectionCommands).useClass(NoteConnectionCommands).eager();
    c.register(JournalLinkCommands).useClass(JournalLinkCommands).eager();
  },
};

export const journalNotesModule: Module = {
  register(c) {
    journalNotesCoreModule.register(c);
    journalNotesStartupModule.register(c);
  },
};
