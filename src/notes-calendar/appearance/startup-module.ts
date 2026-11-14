import type { Module } from "@/infrastructure/di";

import { AppearanceVariables } from "./appearance-variables";

export const calendarAppearanceStartupModule: Module = {
  register(c) {
    c.register(AppearanceVariables).useClass(AppearanceVariables).eager();
  },
};
