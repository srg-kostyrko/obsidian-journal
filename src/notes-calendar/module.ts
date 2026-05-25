import type { Module } from "@/infrastructure/di";

import { ActiveEntryViewModel } from "./active-entry";

export const notesCalendarModule: Module = {
  register(c) {
    c.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel).eager();
  },
};
