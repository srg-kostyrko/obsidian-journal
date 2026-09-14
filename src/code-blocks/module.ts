import type { Module } from "@/infrastructure/di";
import { CodeBlockDefinitionToken, type CodeBlockDefinition } from "@/infrastructure/host";

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

// The one list of fences the plugin registers; the manual's fence test reads it, so a new block
// cannot ship without its documented example being checked.
export const codeBlockDefinitions: readonly CodeBlockDefinition[] = [
  homeCodeBlock,
  navigationCodeBlock,
  noteletsCodeBlock,
  timelineCodeBlock,
];

export const codeBlocksUiModule: Module = {
  register(c) {
    for (const definition of codeBlockDefinitions) c.register(CodeBlockDefinitionToken).useValue(definition);
  },
};

export const codeBlocksModule: Module = {
  register(c) {
    codeBlocksUiModule.register(c);
    codeBlocksCoreModule.register(c);
  },
};
