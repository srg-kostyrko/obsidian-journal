import type { Module } from "@/infrastructure/di";

import { EditNavBlockSegmentFlow } from "./flows/edit-nav-segment.flow";
import { navBlockSettingsUiModule } from "./ui-module";

export const navBlockSettingsCoreModule: Module = {
  register(c) {
    c.register(EditNavBlockSegmentFlow).useClass(EditNavBlockSegmentFlow);
  },
};

export const navBlockSettingsModule: Module = {
  register(c) {
    navBlockSettingsCoreModule.register(c);
    navBlockSettingsUiModule.register(c);
  },
};
