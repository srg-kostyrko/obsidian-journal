import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";

export const commandsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(commandCollection);
    c.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry).eager();
  },
};
