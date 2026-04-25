import type { PluginSettingsV1 } from "@/types/old-settings.types";
import type { PluginSettings } from "@/types/settings.types";
import { migrateV1toV2 } from "./components/v1-v2/v1-v2";
import { migrateV2toV3 } from "./components/v2-v3";

export function migrateData(oldData: PluginSettingsV1 | PluginSettings): {
  migratedData: PluginSettings;
  needsUser: boolean;
} {
  let needsUser = false;
  let migratedData = oldData;
  if (!("version" in migratedData)) {
    migratedData = migrateV1toV2(migratedData);
    needsUser = true;
  }
  if (migratedData.version === 2) {
    migratedData = migrateV2toV3(migratedData);
  }
  return {
    migratedData,
    needsUser,
  };
}
