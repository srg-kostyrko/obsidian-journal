import type { Module } from "@/infrastructure/di";

import { SettingsService } from "./settings-service";
import { PluginSettingTabAdapter } from "./ui/plugin-setting-tab";
import { SettingsUiService } from "./ui/settings-ui-service";

export const settingsModule: Module = {
  register(c) {
    c.register(SettingsService).useClass(SettingsService).eager();
    c.register(SettingsUiService).useClass(SettingsUiService);
    c.register(PluginSettingTabAdapter).useClass(PluginSettingTabAdapter).eager();
  },
};
