import type { Module } from "@/infra/di/contracts/module.types";
import { JournalSettingTab } from "./journal-settings-tab";
import { SettingsStorage } from "./settings.storage";
import { SettingsUiState } from "./settings-ui-state";

export const SettingModule: Module = {
  provides: [JournalSettingTab, SettingsStorage, SettingsUiState],
};
