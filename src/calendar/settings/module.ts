import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { CalendarSettingsBridge } from "./bridge";
import { calendarDisplaySlice } from "./display-slice";
import { calendarSlice } from "./slice";
import CalendarWeekBlock from "./ui/CalendarWeekBlock.vue";

export const calendarSettingsModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(calendarSlice);
    c.register(SliceDefinitionToken).useValue(calendarDisplaySlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "calendar-week",
        component: CalendarWeekBlock,
        order: 10,
      }),
    );
    c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge).eager();
  },
};
