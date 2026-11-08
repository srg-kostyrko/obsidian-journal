import { match } from "ts-pattern";

import { themeColorCss } from "@/ui/theme-color-list";

import type { ColorSettings } from "../config";

export function colorToString(color: ColorSettings): string {
  return match(color)
    .with({ type: "transparent" }, () => "transparent")
    .with({ type: "theme" }, (c) => themeColorCss(c.name))
    .with({ type: "custom" }, (c) => c.color)
    .exhaustive();
}
