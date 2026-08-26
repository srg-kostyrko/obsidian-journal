import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";

import LoggingBlock from "./settings/ui/LoggingBlock.vue";

export const loggingUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "logging", component: LoggingBlock, order: 100 }),
    );
  },
};
