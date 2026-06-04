import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { journalConfigCollection } from "./config";
import { CycleService } from "./cycle";
import { journalFlowsModule } from "./flows/module";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { JournalNavigationCommands } from "./navigation-commands";
import { journalNotesModule } from "./notes/module";
import { NumberingService } from "./numbering";
import { JournalsRepository, type JournalsEvents } from "./repository";
import { TimelineService } from "./timeline";
import { JournalsEventsToken } from "./tokens";
import { journalUriModule } from "./uri/module";
import { VaultSubscriptionService } from "./vault-subscription";
import { JournalsViewModel } from "./view-model";

export const journalsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(journalConfigCollection);
    c.register(JournalsIndex).useClass(JournalsIndex);
    c.register(TimelineService).useClass(TimelineService);
    c.register(CycleService).useClass(CycleService);
    c.register(NumberingService).useClass(NumberingService);
    c.register(FrontmatterService).useClass(FrontmatterService);
    c.register(VaultSubscriptionService).useClass(VaultSubscriptionService).eager();
    c.register(JournalNavigationCommands).useClass(JournalNavigationCommands).eager();
    c.register(JournalsEventsToken).useFactory(() => createNanoEvents<JournalsEvents>());
    c.register(JournalsRepository).useClass(JournalsRepository).eager();
    c.register(JournalsViewModel).useClass(JournalsViewModel).eager();
    journalNotesModule.register(c);
    journalFlowsModule.register(c);
    journalUriModule.register(c);
  },
};
