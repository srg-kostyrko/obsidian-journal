import type { Module } from "@/infrastructure/di";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";

import { JournalsApiService } from "./journals-api";

export const apiModule: Module = {
  register(c) {
    c.register(NoteFileService).useClass(NoteFileService);
    c.register(JournalsApiService).useClass(JournalsApiService);
  },
};
