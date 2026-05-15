import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { journalConfigCollection } from "./config";
import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { TimelineService } from "./timeline";
import { VaultSubscriptionService } from "./vault-subscription";

export const journalsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(journalConfigCollection);
    c.register(JournalsIndex).useClass(JournalsIndex);
    c.register(TimelineService).useClass(TimelineService);
    c.register(CycleService).useClass(CycleService);
    c.register(NumberingService).useClass(NumberingService);
    c.register(FrontmatterService).useClass(FrontmatterService);
    c.register(VaultSubscriptionService).useClass(VaultSubscriptionService).eager();
  },
};
