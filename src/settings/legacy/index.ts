import type { Migration } from "@/settings";

import { v1ToV2Migration } from "./v1-to-v2";
import { v2ToV3Migration } from "./v2-to-v3";
import { v3ToV4Migration } from "./v3-to-v4";

export { legacyMigrationsModule } from "./module";
export { pendingNoteMigrationSlice } from "./pending-note-migration";

export const legacyMigrations: readonly Migration[] = [v1ToV2Migration, v2ToV3Migration, v3ToV4Migration];
