import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import IntervalBlockSection from "./blocks/custom-intervals/ui/IntervalBlockSection.vue";
import VaultNotesPreviewSettingsBlock from "./blocks/day-notes/ui/VaultNotesPreviewSettingsBlock.vue";
import { viewEditSubpage } from "./ui/view-edit-subpage";
import ViewsDashboardBlock from "./ui/ViewsDashboardBlock.vue";

export const viewsUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "views", component: ViewsDashboardBlock, order: 7 }),
    );
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "vault-notes-preview", component: VaultNotesPreviewSettingsBlock, order: 21 }),
    );
    c.register(SubpageToken).useValue(viewEditSubpage);
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "interval-block", order: 90, component: IntervalBlockSection }),
    );
  },
};
