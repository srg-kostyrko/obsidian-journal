import { type App } from "obsidian";
import type { TemplaterPlugin } from "../types/templater.types";

export function canApplyTemplater(app: App, content: string): boolean {
  if (!content.includes("<%") && !content.includes("%>")) return false;
  const templaterPlugin = app.plugins.getPlugin("templater-obsidian") as TemplaterPlugin | null;
  if (!templaterPlugin) return false;
  // version support check
  if (!("templater" in templaterPlugin)) return false;
  if (!("create_running_config" in templaterPlugin.templater)) return false;
  if (!("parse_template" in templaterPlugin.templater)) return false;
  return true;
}
