import { createToken } from "@/infra/di/token";
import type { SettingsStorage, SettingTab, SettingsPersistence as SettingsPersistenceContract } from "./settings.types";

export const JournalSettingsTab = createToken<SettingTab>("JournalSettingsTab");

export const Settings = createToken<SettingsStorage>("Settings");

export const SettingsPersistence = createToken<SettingsPersistenceContract>("SettingsPersistence");
