import type { Module } from "@/infrastructure/di";

import { SettingsService } from "./settings-service";

export const settingsModule: Module = {
  register(c) {
    c.register(SettingsService).useClass(SettingsService).eager();
  },
};
