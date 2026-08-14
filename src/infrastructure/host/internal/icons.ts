import { getIcon } from "obsidian";

export function renderIcon(name: string): SVGSVGElement | null {
  return getIcon(name);
}
