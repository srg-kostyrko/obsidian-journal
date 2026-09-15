import { inject, type Module } from "@/infrastructure/di";

import { ImportService } from "./import-service";
import { ImportPlanner } from "./planner";
import { ImportSourceToken } from "./source";
import { CalendarSource } from "./sources/calendar";
import { DailyNotesSource } from "./sources/daily-notes";
import { PeriodicNotesSource } from "./sources/periodic-notes";

export const importCoreModule: Module = {
  register(c) {
    c.register(PeriodicNotesSource).useClass(PeriodicNotesSource);
    c.register(CalendarSource).useClass(CalendarSource);
    c.register(DailyNotesSource).useClass(DailyNotesSource);
    c.register(ImportSourceToken).useFactory(() => inject(PeriodicNotesSource));
    c.register(ImportSourceToken).useFactory(() => inject(CalendarSource));
    c.register(ImportSourceToken).useFactory(() => inject(DailyNotesSource));
    c.register(ImportPlanner).useClass(ImportPlanner);
    c.register(ImportService).useClass(ImportService);
  },
};
