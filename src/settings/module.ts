import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";

import { ReloadHintService } from "./reload-hint";
import { SettingsService } from "./settings-service";
import { SnapshotService } from "./snapshots/snapshot-service";
import { SettingsEventsToken, type SettingsEvents } from "./tokens";
import { PluginSettingTabAdapter } from "./ui/plugin-setting-tab";
import { SettingsUiService } from "./ui/settings-ui-service";

export const settingsCoreModule: Module = {
  register(c) {
    c.register(SettingsEventsToken).useFactory(() => createNanoEvents<SettingsEvents>());
    c.register(SnapshotService).useClass(SnapshotService);
    c.register(SettingsService).useClass(SettingsService).eager();
    c.register(SettingsUiService).useClass(SettingsUiService);
    c.register(ReloadHintService).useClass(ReloadHintService);
  },
};

export const settingsModule: Module = {
  register(c) {
    settingsCoreModule.register(c);
    c.register(PluginSettingTabAdapter).useClass(PluginSettingTabAdapter).eager();
  },
};
