import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { CalendarSettingsBridge } from "./bridge";
import { calendarDisplaySlice } from "./display-slice";
import { calendarSlice } from "./slice";
import { calendarSettingsUiModule } from "./ui-module";

export const calendarSettingsCoreModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(calendarSlice);
    c.register(SliceDefinitionToken).useValue(calendarDisplaySlice);
    c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge).eager();
  },
};

export const calendarSettingsModule: Module = {
  register(c) {
    calendarSettingsCoreModule.register(c);
    calendarSettingsUiModule.register(c);
  },
};
