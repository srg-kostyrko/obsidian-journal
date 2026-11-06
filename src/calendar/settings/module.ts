import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { CalendarSettingsBridge } from "./bridge";
import { calendarDisplaySlice } from "./display-slice";
import { calendarSlice } from "./slice";
import { calendarSettingsUiModule } from "./ui-module";

// The display settings alone, for a test that renders a calendar without the bridge installing the
// vault's week grid over its own.
export const calendarDisplayCoreModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(calendarDisplaySlice);
  },
};

export const calendarSettingsCoreModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(calendarSlice);
    calendarDisplayCoreModule.register(c);
    c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge).eager();
  },
};

export const calendarSettingsModule: Module = {
  register(c) {
    calendarSettingsCoreModule.register(c);
    calendarSettingsUiModule.register(c);
  },
};
