import type { Module } from "@/infrastructure/di";

import { JournalsIndex } from "./journals-index";

export const journalsIndexModule: Module = {
  register(c) {
    c.register(JournalsIndex).useClass(JournalsIndex);
  },
};
