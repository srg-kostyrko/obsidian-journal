import type { ColorSettings } from "@/types/settings.types";
import * as v from "valibot";

export const colorScheme = v.variant("type", [
  v.object({
    type: v.literal("transparent"),
  }),
  v.object({
    type: v.literal("theme"),
    name: v.string(),
  }),
  v.object({
    type: v.literal("custom"),
    color: v.string(),
  }),
]);

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
