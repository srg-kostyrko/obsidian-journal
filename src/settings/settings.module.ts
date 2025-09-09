import type { Module } from "@/infra/di/contracts/module.types";
import { JournalSettingTab } from "./journal-settings-tab";
import { SettingsStorage } from "./settings.storage";

export const SettingModule: Module = {
  provides: [JournalSettingTab, SettingsStorage],
};
