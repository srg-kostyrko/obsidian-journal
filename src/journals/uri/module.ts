import type { Module } from "@/infrastructure/di";

import { JournalUriHandler } from "./journal-uri-handler";

export const journalUriModule: Module = {
  register(c) {
    c.register(JournalUriHandler).useClass(JournalUriHandler);
  },
};
