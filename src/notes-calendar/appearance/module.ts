import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { appearanceSlice } from "./slice";
import AppearanceBlock from "./ui/AppearanceBlock.vue";

export const calendarAppearanceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "calendar-appearance",
        component: AppearanceBlock,
        order: 20,
      }),
    );
  },
};
