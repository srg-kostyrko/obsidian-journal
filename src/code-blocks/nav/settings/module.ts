import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";

import { EditNavBlockRowFlow } from "./flows/edit-nav-row.flow";
import NavBlockSection from "./ui/NavBlockSection.vue";

export const navBlockSettingsModule: Module = {
  register(c) {
    c.register(EditNavBlockRowFlow).useClass(EditNavBlockRowFlow);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({
        key: "nav-block",
        order: 80,
        component: NavBlockSection,
      }),
    );
  },
};
