import { Platform } from "obsidian";

export function isMetaPressed(event: MouseEvent | KeyboardEvent) {
  return Platform.isMacOS ? event.metaKey : event.ctrlKey;
}
