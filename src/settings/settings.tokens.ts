import { createToken } from "@/infra/di/token";
import type { SettingTab } from "./settings.types";

export const JournalSettingsTab = createToken<SettingTab>("JournalSettingsTab");
