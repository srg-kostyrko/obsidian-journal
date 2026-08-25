import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";
import { ShelfEditSectionToken, defineShelfEditSection } from "@/shelves/ui/shelf-edit-section";

import CalendarDecorationsBlock from "./ui/CalendarDecorationsBlock.vue";
import JournalDecorationsSection from "./ui/JournalDecorationsSection.vue";
import ShelfDecorationsSection from "./ui/ShelfDecorationsSection.vue";

export const decorationsSettingsUiModule: Module = {
  register(c) {
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "decorations", order: 100, component: JournalDecorationsSection }),
    );
    c.register(ShelfEditSectionToken).useValue(
      defineShelfEditSection({ key: "decorations", order: 100, component: ShelfDecorationsSection }),
    );
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "calendar-decorations", component: CalendarDecorationsBlock, order: 11 }),
    );
  },
};
