import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { appearanceSlice } from "./slice";
import { calendarAppearanceUiModule } from "./ui-module";

export const calendarAppearanceCoreModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
  },
};

export const calendarAppearanceModule: Module = {
  register(c) {
    calendarAppearanceCoreModule.register(c);
    calendarAppearanceUiModule.register(c);
  },
};
