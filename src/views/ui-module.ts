import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import IntervalBlockSection from "./blocks/custom-intervals/ui/IntervalBlockSection.vue";
import DayNotesSettingsBlock from "./blocks/day-notes/ui/DayNotesSettingsBlock.vue";
import { viewEditSubpage } from "./ui/view-edit-subpage";
import ViewsDashboardBlock from "./ui/ViewsDashboardBlock.vue";

export const viewsUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "views", component: ViewsDashboardBlock, order: 7 }),
    );
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "day-notes", component: DayNotesSettingsBlock, order: 8 }),
    );
    c.register(SubpageToken).useValue(viewEditSubpage);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "interval-block", order: 90, component: IntervalBlockSection }),
    );
  },
};
