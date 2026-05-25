import type { Module } from "@/infrastructure/di";

import { DecorationEngine } from "./engine";

export const decorationsModule: Module = {
  register(c) {
    c.register(DecorationEngine).useClass(DecorationEngine);
  },
};
