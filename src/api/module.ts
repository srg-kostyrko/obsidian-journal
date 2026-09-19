import { inject, type Module } from "@/infrastructure/di";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";

import { JournalsApiService } from "./journals-api";
import { LocalRestApiBridge } from "./local-rest-api/local-rest-api-bridge";
import { RestRouteToken } from "./local-rest-api/route";
import { CreateNoteRoute } from "./local-rest-api/routes/create-note";
import { CreateNoteletRoute } from "./local-rest-api/routes/create-notelet";
import { JournalInfoRoute } from "./local-rest-api/routes/journal-info";
import { JournalListRoute } from "./local-rest-api/routes/journal-list";
import { NoteRedirectRoute, NoteSectionRedirectRoute } from "./local-rest-api/routes/note-redirect";
import { NotesListingRoute } from "./local-rest-api/routes/notes-listing";
import { McpToolToken } from "./local-rest-api/tool";
import { JournalListTool } from "./local-rest-api/tools/journal-list";
import { JournalNotesTool } from "./local-rest-api/tools/journal-notes";
import { NoteEnsureTool } from "./local-rest-api/tools/note-ensure";
import { NoteletCreateTool } from "./local-rest-api/tools/notelet-create";

export const apiModule: Module = {
  register(c) {
    c.register(NoteFileService).useClass(NoteFileService);
    c.register(JournalsApiService).useClass(JournalsApiService);

    c.register(JournalListRoute).useClass(JournalListRoute);
    c.register(JournalInfoRoute).useClass(JournalInfoRoute);
    c.register(NotesListingRoute).useClass(NotesListingRoute);
    c.register(CreateNoteRoute).useClass(CreateNoteRoute);
    c.register(CreateNoteletRoute).useClass(CreateNoteletRoute);
    c.register(NoteRedirectRoute).useClass(NoteRedirectRoute);
    c.register(NoteSectionRedirectRoute).useClass(NoteSectionRedirectRoute);
    // The bridge adds routes in this order, and Express matches in the order routes were added:
    // the literal notes and notelets paths must come before "/journals/:name/:date", or "notes"
    // and "notelets" would match :date there first.
    c.register(RestRouteToken).useFactory(() => inject(JournalListRoute));
    c.register(RestRouteToken).useFactory(() => inject(JournalInfoRoute));
    c.register(RestRouteToken).useFactory(() => inject(NotesListingRoute));
    c.register(RestRouteToken).useFactory(() => inject(CreateNoteRoute));
    c.register(RestRouteToken).useFactory(() => inject(CreateNoteletRoute));
    c.register(RestRouteToken).useFactory(() => inject(NoteRedirectRoute));
    c.register(RestRouteToken).useFactory(() => inject(NoteSectionRedirectRoute));

    c.register(JournalListTool).useClass(JournalListTool);
    c.register(JournalNotesTool).useClass(JournalNotesTool);
    c.register(NoteEnsureTool).useClass(NoteEnsureTool);
    c.register(NoteletCreateTool).useClass(NoteletCreateTool);
    c.register(McpToolToken).useFactory(() => inject(JournalListTool));
    c.register(McpToolToken).useFactory(() => inject(JournalNotesTool));
    c.register(McpToolToken).useFactory(() => inject(NoteEnsureTool));
    c.register(McpToolToken).useFactory(() => inject(NoteletCreateTool));

    c.register(LocalRestApiBridge).useClass(LocalRestApiBridge);
  },
};
