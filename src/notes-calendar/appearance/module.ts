import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { AppearanceVariables } from "./appearance-variables";
import { appearanceSlice } from "./slice";
import { calendarAppearanceUiModule } from "./ui-module";

export const calendarAppearanceCoreModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
    c.register(AppearanceVariables).useClass(AppearanceVariables).eager();
  },
};

export const calendarAppearanceModule: Module = {
  register(c) {
    calendarAppearanceCoreModule.register(c);
    calendarAppearanceUiModule.register(c);
  },
};
