import type { Module } from "@/infrastructure/di";

import { CreateNoteletFlow } from "./create-notelet.flow";

export const noteletFlowsModule: Module = {
  register(c) {
    c.register(CreateNoteletFlow).useClass(CreateNoteletFlow);
  },
};
