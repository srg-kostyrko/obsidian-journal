import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { startupSlice } from "./slice";
import { StartupOpenService } from "./startup-open";
import { journalStartupUiModule } from "./ui-module";

export const journalStartupCoreModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(startupSlice);
    c.register(StartupOpenService).useClass(StartupOpenService);
  },
};

export const startupModule: Module = {
  register(c) {
    journalStartupCoreModule.register(c);
    journalStartupUiModule.register(c);
  },
};
