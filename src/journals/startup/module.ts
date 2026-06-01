import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { startupSlice } from "./slice";
import { StartupOpenService } from "./startup-open";
import StartupBlock from "./ui/StartupBlock.vue";

export const startupModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(startupSlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({
        key: "startup",
        component: StartupBlock,
        order: 8,
      }),
    );
    c.register(StartupOpenService).useClass(StartupOpenService);
  },
};
