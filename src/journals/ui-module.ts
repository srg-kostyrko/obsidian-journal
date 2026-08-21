import type { Module } from "@/infrastructure/di";

import { JournalEditSectionToken, defineJournalEditSection } from "./settings/ui/journal-edit-section";
import FrontmatterSection from "./settings/ui/sections/FrontmatterSection.vue";
import NoteCreationSection from "./settings/ui/sections/NoteCreationSection.vue";
import SequenceSection from "./settings/ui/sections/SequenceSection.vue";
import TemplatesSection from "./settings/ui/sections/TemplatesSection.vue";
import TimelineSection from "./settings/ui/sections/TimelineSection.vue";

export const journalsUiModule: Module = {
  register(c) {
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
