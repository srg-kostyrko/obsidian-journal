import type { Module } from "@/infrastructure/di";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";

import { JournalsApiService } from "./journals-api";
import { LocalRestApiBridge } from "./rest/local-rest-api-bridge";

export const apiModule: Module = {
  register(c) {
    c.register(NoteFileService).useClass(NoteFileService);
    c.register(JournalsApiService).useClass(JournalsApiService);
    c.register(LocalRestApiBridge).useClass(LocalRestApiBridge);
  },
};
