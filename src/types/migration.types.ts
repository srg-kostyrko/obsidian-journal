import type { JournalConfigV1 } from "./old-settings.types";

export interface MigrationV1toV2 {
  type: "v1-v2";
  shelfDecided: boolean;
  frontmatterDecided: boolean;
  journals: JournalConfigV1[];
}

export type PendingMigration = MigrationV1toV2;
