import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";

import NavBlockSection from "./ui/NavBlockSection.vue";

export const navBlockSettingsUiModule: Module = {
  register(c) {
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({
        key: "nav-block",
        order: 80,
        component: NavBlockSection,
      }),
    );
  },
};
