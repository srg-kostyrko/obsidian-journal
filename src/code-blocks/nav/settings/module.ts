import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";

import { EditNavBlockSegmentFlow } from "./flows/edit-nav-segment.flow";
import NavBlockSection from "./ui/NavBlockSection.vue";

export const navBlockSettingsModule: Module = {
  register(c) {
    c.register(EditNavBlockSegmentFlow).useClass(EditNavBlockSegmentFlow);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({
        key: "nav-block",
        order: 80,
        component: NavBlockSection,
      }),
    );
  },
};
