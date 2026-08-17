import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SubpageToken, defineDashboardBlock } from "@/settings";

import { RepairService } from "./repair-service";
import { ScanService } from "./scan-service";
import { ScannedNoteResolver } from "./scanned-note";
import { maintenanceSubpage } from "./ui/maintenance-subpage";
import MaintenanceBlock from "./ui/MaintenanceBlock.vue";

export const maintenanceModule: Module = {
  register(c) {
    c.register(SubpageToken).useValue(maintenanceSubpage);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "maintenance", component: MaintenanceBlock, order: 110 }),
    );
    c.register(ScannedNoteResolver).useClass(ScannedNoteResolver);
    c.register(ScanService).useClass(ScanService);
    c.register(RepairService).useClass(RepairService);
  },
};
