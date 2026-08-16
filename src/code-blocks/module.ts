import type { Module } from "@/infrastructure/di";
import { CodeBlockDefinitionToken } from "@/infrastructure/host";

import { homeCodeBlock } from "./home/home-block";
import { navigationCodeBlock } from "./nav/nav-block";
import { NavReferenceIntegrity } from "./nav/nav-reference-integrity";
import { timelineCodeBlock } from "./timeline/timeline-block";

export const codeBlocksModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(navigationCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(timelineCodeBlock);
    c.register(NavReferenceIntegrity).useClass(NavReferenceIntegrity).eager();
  },
};
