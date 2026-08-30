import type { Module } from "@/infrastructure/di";

import { NoteletPathService } from "./notelet-path";

export const noteletsCoreModule: Module = {
  register(c) {
    c.register(NoteletPathService).useClass(NoteletPathService);
  },
};
