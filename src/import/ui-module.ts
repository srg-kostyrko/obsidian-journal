import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";

import ImportNoticeBlock from "./ui/ImportNoticeBlock.vue";

export const importUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "import-notice", component: ImportNoticeBlock, order: 1 }),
    );
  },
};
