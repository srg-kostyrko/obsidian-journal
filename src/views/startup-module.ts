import type { Module } from "@/infrastructure/di";

import { ViewHostService } from "./view-host";

export const viewsStartupModule: Module = {
  register(c) {
    c.register(ViewHostService).useClass(ViewHostService).eager();
  },
};
