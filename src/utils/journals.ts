import type { OpenMode } from "@/types/settings.types";
import { Keymap } from "obsidian";

export function defineOpenMode(event: MouseEvent): OpenMode {
  if (Keymap.isModifier(event, "Mod") || event.button === 1) return "tab";
  return "active";
}
