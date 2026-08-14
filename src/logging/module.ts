import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { DumpLogsFlow } from "./flows/dump-logs.flow";
import { LoggingSettingsBridge } from "./settings/bridge";
import { loggingSlice } from "./settings/slice";
import LoggingBlock from "./settings/ui/LoggingBlock.vue";

export const loggingModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(loggingSlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "logging", component: LoggingBlock, order: 100 }),
    );
    c.register(DumpLogsFlow).useClass(DumpLogsFlow);
    c.register(LoggingSettingsBridge).useClass(LoggingSettingsBridge).eager();
  },
};
