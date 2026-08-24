import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";

import CalendarWeekBlock from "./ui/CalendarWeekBlock.vue";

export const calendarSettingsUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "calendar-week",
        component: CalendarWeekBlock,
        order: 10,
      }),
    );
  },
};
