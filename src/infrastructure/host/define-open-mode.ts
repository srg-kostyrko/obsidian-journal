import type { OpenMode } from "./types";

export function defineOpenMode(event: MouseEvent | KeyboardEvent): OpenMode {
  const middleClick = "button" in event && event.button === 1;
  const newTab = event.ctrlKey || event.metaKey || middleClick;
  if (newTab && event.altKey) return "split";
  if (newTab) return "tab";
  return "active";
}
