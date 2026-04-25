import { PLUGIN_KEY } from "@/constants";
import type { JournalPlugin } from "@/types/plugin.types";
import { inject } from "vue";

export function usePlugin(): JournalPlugin {
  const plugin = inject(PLUGIN_KEY);
  if (!plugin) throw new Error("Plugin not provided or composable used outside of vue context");
  return plugin;
}
