import type { OpenMode } from "./types";

export function defineOpenMode(event: MouseEvent): OpenMode {
  if (event.ctrlKey || event.metaKey || event.button === 1) return "tab";
  return "active";
}
