import type { Module } from "@/infrastructure/di";
import type { Migration } from "@/settings";
import { MigrationToken, SliceDefinitionToken } from "@/settings";

import { DataMigrationService } from "./data-migration-service";
import { pendingNoteMigrationSlice } from "./pending-note-migration";
import { v1ToV2Migration } from "./v1-to-v2";
import { v2ToV3Migration } from "./v2-to-v3";
import { v3ToV4Migration } from "./v3-to-v4";

export const legacyMigrations: readonly Migration[] = [v1ToV2Migration, v2ToV3Migration, v3ToV4Migration];

export const legacyMigrationsModule: Module = {
  register(c) {
    for (const migration of legacyMigrations) c.register(MigrationToken).useValue(migration);
    c.register(SliceDefinitionToken).useValue(pendingNoteMigrationSlice);
    c.register(DataMigrationService).useClass(DataMigrationService);
  },
};
