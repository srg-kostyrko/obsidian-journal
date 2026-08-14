import type { Module } from "@/infrastructure/di";

import { DecorationsStore } from "./decorations-store";
import { DecorationEngine } from "./engine";
import { DecorationMatchService } from "./match-service";

export const decorationsModule: Module = {
  register(c) {
    c.register(DecorationEngine).useClass(DecorationEngine);
    c.register(DecorationsStore).useClass(DecorationsStore);
    c.register(DecorationMatchService).useClass(DecorationMatchService);
  },
};
