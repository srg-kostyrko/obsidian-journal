import { inject, type Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { ImportConnectService } from "./connect-service";
import { ImportFromPluginsFlow } from "./flows/import.flow";
import { ImportService } from "./import-service";
import { ImportPlanner } from "./planner";
import { importNoticeSlice } from "./settings/slice";
import { ImportSourceToken } from "./source";
import { CalendarSource } from "./sources/calendar";
import { DailyNotesSource } from "./sources/daily-notes";
import { PeriodicNotesSource } from "./sources/periodic-notes";
import { importUiModule } from "./ui-module";

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
    c.register(ImportConnectService).useClass(ImportConnectService);
    c.register(ImportFromPluginsFlow).useClass(ImportFromPluginsFlow);
    c.register(SliceDefinitionToken).useValue(importNoticeSlice);
  },
};

export const importModule: Module = {
  register(c) {
    importCoreModule.register(c);
    importUiModule.register(c);
  },
};
