import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";

import { DumpLogsFlow } from "./flows/dump-logs.flow";
import { LoggingSettingsBridge } from "./settings/bridge";
import { loggingSlice } from "./settings/slice";
import { loggingUiModule } from "./ui-module";

export const loggingCoreModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(loggingSlice);
    c.register(DumpLogsFlow).useClass(DumpLogsFlow);
    c.register(LoggingSettingsBridge).useClass(LoggingSettingsBridge).eager();
  },
};

export const loggingModule: Module = {
  register(c) {
    loggingCoreModule.register(c);
    loggingUiModule.register(c);
  },
};
