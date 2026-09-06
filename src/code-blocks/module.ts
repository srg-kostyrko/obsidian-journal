import type { Module } from "@/infrastructure/di";
import { CodeBlockDefinitionToken } from "@/infrastructure/host";

import { homeCodeBlock } from "./home/home-block";
import { navigationCodeBlock } from "./nav/nav-block";
import { NavReferenceIntegrity } from "./nav/nav-reference-integrity";
import { noteletsCodeBlock } from "./notelets/notelets-block";
import { timelineCodeBlock } from "./timeline/timeline-block";

export const codeBlocksCoreModule: Module = {
  register(c) {
    c.register(NavReferenceIntegrity).useClass(NavReferenceIntegrity).eager();
  },
};

export const codeBlocksUiModule: Module = {
  register(c) {
    c.register(CodeBlockDefinitionToken).useValue(homeCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(navigationCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(noteletsCodeBlock);
    c.register(CodeBlockDefinitionToken).useValue(timelineCodeBlock);
  },
};

export const codeBlocksModule: Module = {
  register(c) {
    codeBlocksUiModule.register(c);
    codeBlocksCoreModule.register(c);
  },
};
