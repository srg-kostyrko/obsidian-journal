import type { Module } from "@/infrastructure/di";

import { noteletFlowsModule } from "./flows/module";
import { NoteletCreationService } from "./notelet-creation";
import { NoteletPathService } from "./notelet-path";

export const noteletsCoreModule: Module = {
  register(c) {
    c.register(NoteletPathService).useClass(NoteletPathService);
    c.register(NoteletCreationService).useClass(NoteletCreationService);
    noteletFlowsModule.register(c);
  },
};
