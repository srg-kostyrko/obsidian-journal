import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { shelvesCollection } from "./config";
import { ShelvesLifecycleService } from "./lifecycle";

export const shelvesModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(shelvesCollection);
    c.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService).eager();
  },
};
