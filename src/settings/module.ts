import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";

import { ReloadHintService } from "./reload-hint";
import { SettingsService } from "./settings-service";
import { SettingsEventsToken, type SettingsEvents } from "./tokens";
import { PluginSettingTabAdapter } from "./ui/plugin-setting-tab";
import { SettingsUiService } from "./ui/settings-ui-service";

export const settingsModule: Module = {
  register(c) {
    c.register(SettingsEventsToken).useFactory(() => createNanoEvents<SettingsEvents>());
    c.register(SettingsService).useClass(SettingsService).eager();
    c.register(SettingsUiService).useClass(SettingsUiService);
    c.register(ReloadHintService).useClass(ReloadHintService);
    c.register(PluginSettingTabAdapter).useClass(PluginSettingTabAdapter).eager();
  },
};
