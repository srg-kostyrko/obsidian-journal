import type { Module } from "@/infrastructure/di";
import { JournalEditSectionToken, defineJournalEditSection } from "@/journals";
import { DashboardBlockToken, defineDashboardBlock } from "@/settings";
import { ShelfEditSectionToken, defineShelfEditSection } from "@/shelves";

import CommandsDashboardBlock from "./ui/CommandsDashboardBlock.vue";
import JournalCommandsSection from "./ui/JournalCommandsSection.vue";
import ShelfCommandsSection from "./ui/ShelfCommandsSection.vue";

export const commandsUiModule: Module = {
  register(c) {
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "commands", component: CommandsDashboardBlock, order: 6 }),
    );
    c.register(JournalEditSectionToken).useValue(
      defineJournalEditSection({ key: "commands", component: JournalCommandsSection, order: 70 }),
    );
    c.register(ShelfEditSectionToken).useValue(
      defineShelfEditSection({ key: "commands", component: ShelfCommandsSection, order: 10 }),
    );
  },
};
