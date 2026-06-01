import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { CalendarAppearanceBridge } from "./bridge";
import { appearanceSlice } from "./slice";

export const calendarAppearanceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
    c.register(CalendarAppearanceBridge).useClass(CalendarAppearanceBridge).eager();
  },
};
