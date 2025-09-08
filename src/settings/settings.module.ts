import type { Module } from "@/infra/di/contracts/module.types";
import { JournalSettingTab } from "./journal-settings-tab";

export const SettingModule: Module = {
  provides: [JournalSettingTab],
};
