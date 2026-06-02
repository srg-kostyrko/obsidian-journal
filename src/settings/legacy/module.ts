import type { Module } from "@/infrastructure/di";
import { MigrationToken, SliceDefinitionToken } from "@/settings";

import { DataMigrationService } from "./data-migration-service";
import { pendingNoteMigrationSlice } from "./pending-note-migration";
import { v1ToV2Migration } from "./v1-to-v2";
import { v2ToV3Migration } from "./v2-to-v3";
import { v3ToV4Migration } from "./v3-to-v4";

export const legacyMigrationsModule: Module = {
  register(c) {
    c.register(MigrationToken).useValue(v1ToV2Migration);
    c.register(MigrationToken).useValue(v2ToV3Migration);
    c.register(MigrationToken).useValue(v3ToV4Migration);
    c.register(SliceDefinitionToken).useValue(pendingNoteMigrationSlice);
    c.register(DataMigrationService).useClass(DataMigrationService);
  },
};
