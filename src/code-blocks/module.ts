import type { Module } from "@/infrastructure/di";
import { CodeBlockDefinitionToken } from "@/infrastructure/host";

import { homeCodeBlock } from "./home/home-block";

export const codeBlocksModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
  },
};
