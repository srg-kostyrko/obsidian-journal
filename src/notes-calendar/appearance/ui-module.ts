import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { appearanceSubpage } from "./ui/appearance-subpage";
import AppearanceBlock from "./ui/AppearanceBlock.vue";

export const calendarAppearanceUiModule: Module = {
  register(c) {
    c.register(SubpageToken).useValue(appearanceSubpage);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "calendar-appearance",
        component: AppearanceBlock,
        order: 20,
      }),
    );
  },
};
