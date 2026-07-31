import type { Module } from "@/infrastructure/di";

import { DecorationsStore } from "./decorations-store";
import { DecorationEngine } from "./engine";

export const decorationsModule: Module = {
  register(c) {
    c.register(DecorationEngine).useClass(DecorationEngine);
    c.register(DecorationsStore).useClass(DecorationsStore);
  },
};
