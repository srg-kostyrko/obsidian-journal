import type { Module } from "@/infrastructure/di";
import { CodeBlockDefinitionToken } from "@/infrastructure/host";

import { homeCodeBlock } from "./home/home-block";
import { navigationCodeBlock } from "./nav/nav-block";

export const codeBlocksModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(navigationCodeBlock);
  },
};
