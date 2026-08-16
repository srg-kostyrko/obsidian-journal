import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { maintenanceSubpage } from "./ui/maintenance-subpage";
import MaintenanceBlock from "./ui/MaintenanceBlock.vue";

export const maintenanceModule: Module = {
  register(c) {
    c.register(SubpageToken).useValue(maintenanceSubpage);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "maintenance", component: MaintenanceBlock, order: 110 }),
    );
  },
};
