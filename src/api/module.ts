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

    c.register(LocalRestApiBridge).useClass(LocalRestApiBridge);
  },
};
