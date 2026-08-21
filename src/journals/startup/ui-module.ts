import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";

import StartupBlock from "./ui/StartupBlock.vue";

export const journalStartupUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "startup",
        component: StartupBlock,
        order: 8,
      }),
    );
  },
};
