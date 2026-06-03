import type { OpenMode } from "./types";

export function defineOpenMode(event: MouseEvent): OpenMode {
  const newTab = event.ctrlKey || event.metaKey || event.button === 1;
  if (newTab && event.altKey) return "split";
  if (newTab) return "tab";
  return "active";
}
