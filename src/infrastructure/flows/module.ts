import type { Module } from "@/infrastructure/di";

import { Flows } from "./flows";

export const FlowsModule: Module = {
  register(c) {
    c.register(Flows).useClass(Flows);
  },
};
