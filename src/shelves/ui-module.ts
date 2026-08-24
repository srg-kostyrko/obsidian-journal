import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import JournalsDashboardBlock from "./ui/JournalsDashboardBlock.vue";
import JournalShelfSection from "./ui/JournalShelfSection.vue";
import { shelfEditSubpage } from "./ui/shelf-edit-subpage";
import ShelvesDashboardBlock from "./ui/ShelvesDashboardBlock.vue";

export const shelvesUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "shelves", component: ShelvesDashboardBlock, order: 4 }),
    );
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "journals", component: JournalsDashboardBlock, order: 5 }),
    );
    c.register(SubpageToken).useValue(shelfEditSubpage);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "shelf", component: JournalShelfSection, order: 10 }),
    );
  },
};
