import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";

import AppearanceBlock from "./ui/AppearanceBlock.vue";

export const calendarAppearanceUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "calendar-appearance",
        component: AppearanceBlock,
        order: 20,
      }),
    );
  },
};
