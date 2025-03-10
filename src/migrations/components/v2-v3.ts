import { defaultPluginSettings } from "@/defaults";
import type { PluginSettings } from "@/types/settings.types";
import { deepCopy } from "@/utils/misc";

export function migrateV2toV3(data: PluginSettings): PluginSettings {
  if (!data.commands) data.commands = deepCopy(defaultPluginSettings.commands);
  for (const shelf of Object.values(data.shelves)) {
    if (!shelf.commands) shelf.commands = [];
  }
  if (!data.dismissedNotifications) data.dismissedNotifications = [];
  data.version = 3;
  return data;
}
