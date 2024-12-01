import type { App } from "obsidian";
import { usePlugin } from "./use-plugin";

export function useApp(): App {
  const plugin = usePlugin();
  return plugin.app;
}
