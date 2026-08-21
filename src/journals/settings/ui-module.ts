import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import CollidingJournalsBlock from "./ui/CollidingJournalsBlock.vue";
import { journalEditSubpage } from "./ui/journals-subpage";

export const journalsSettingsUiModule: Module = {
  register(c) {
    c.register(SubpageToken).useValue(journalEditSubpage);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "colliding-journals", component: CollidingJournalsBlock, order: 2 }),
    );
  },
};
