import type { PluginSettings } from "@/types/settings.types";

export function migrateV2toV3(data: PluginSettings): PluginSettings {
  if (!data.commands) data.commands = [];
  for (const shelf of Object.values(data.shelves)) {
    if (!shelf.commands) shelf.commands = [];
  }
  data.version = 3;
  return data;
}
