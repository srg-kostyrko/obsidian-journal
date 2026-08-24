import type { Module } from "@/infrastructure/di";

import { RepairService } from "./repair-service";
import { ScanService } from "./scan-service";
import { ScannedNoteResolver } from "./scanned-note";
import { maintenanceUiModule } from "./ui-module";

export const maintenanceCoreModule: Module = {
  register(c) {
    c.register(ScannedNoteResolver).useClass(ScannedNoteResolver);
    c.register(ScanService).useClass(ScanService);
    c.register(RepairService).useClass(RepairService);
  },
};

export const maintenanceModule: Module = {
  register(c) {
    maintenanceCoreModule.register(c);
    maintenanceUiModule.register(c);
  },
};
