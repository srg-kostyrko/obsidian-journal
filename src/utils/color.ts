import type { ColorSettings } from "@/types/settings.types";

export function colorToString(color: ColorSettings) {
  switch (color.type) {
    case "transparent": {
      return "transparent";
    }
    case "theme": {
      return `var(--${color.name})`;
    }
    case "custom": {
      return color.color;
    }
  }
}
