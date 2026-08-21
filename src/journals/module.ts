import { createNanoEvents } from "nanoevents";

import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { journalConfigCollection } from "./config";
import { CycleService } from "./cycle";
import { journalFlowsModule } from "./flows/module";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { JournalNavigationCommands } from "./navigation-commands";
import { journalNotesCoreModule, journalNotesStartupModule } from "./notes/module";
import { NumberingService } from "./numbering";
import { JournalsRepository, type JournalsEvents } from "./repository";
import { JournalEditSectionToken, defineJournalEditSection } from "./settings/ui/journal-edit-section";
import FrontmatterSection from "./settings/ui/sections/FrontmatterSection.vue";
import NoteCreationSection from "./settings/ui/sections/NoteCreationSection.vue";
import SequenceSection from "./settings/ui/sections/SequenceSection.vue";
import TemplatesSection from "./settings/ui/sections/TemplatesSection.vue";
import TimelineSection from "./settings/ui/sections/TimelineSection.vue";
import { TimelineService } from "./timeline";
import { JournalsEventsToken } from "./tokens";
import { journalUriModule } from "./uri/module";
import { VaultSubscriptionService } from "./vault-subscription";
import { JournalsViewModel } from "./view-model";

export const journalsCoreModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(journalConfigCollection);
    c.register(JournalsIndex).useClass(JournalsIndex);
    c.register(TimelineService).useClass(TimelineService);
    c.register(CycleService).useClass(CycleService);
    c.register(NumberingService).useClass(NumberingService);
    c.register(FrontmatterService).useClass(FrontmatterService);
    c.register(VaultSubscriptionService).useClass(VaultSubscriptionService).eager();
    c.register(JournalsEventsToken).useFactory(() => createNanoEvents<JournalsEvents>());
    c.register(JournalsRepository).useClass(JournalsRepository).eager();
    c.register(JournalsViewModel).useClass(JournalsViewModel).eager();
    journalNotesCoreModule.register(c);
    journalFlowsModule.register(c);
    journalUriModule.register(c);
  },
};

export const journalsModule: Module = {
  register(c) {
    journalsCoreModule.register(c);
    journalNotesStartupModule.register(c);
    c.register(JournalNavigationCommands).useClass(JournalNavigationCommands).eager();
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "note-creation", order: 20, component: NoteCreationSection }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "templates", order: 30, component: TemplatesSection }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "timeline", order: 40, component: TimelineSection }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "sequence", order: 50, component: SequenceSection }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "frontmatter", order: 60, component: FrontmatterSection }),
    );
  },
};
