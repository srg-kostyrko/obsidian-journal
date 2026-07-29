import * as v from "valibot";

import { m } from "@/i18n";

import { DEFINED_NAVIGATION_TARGETS } from "./defined-navigation-targets";

import type { ToolbarItemAppearance } from "../appearance";

export const definedNavigationSchema = v.object({
  target: v.picklist(DEFINED_NAVIGATION_TARGETS),
  direction: v.picklist(["previous", "next"] as const),
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});

export type DefinedNavigationConfig = v.InferOutput<typeof definedNavigationSchema>;
export type DefinedNavigationConfigChange = (next: DefinedNavigationConfig) => void;

export function resolveDefinedNavigationAppearance(config: DefinedNavigationConfig): ToolbarItemAppearance {
  return config.direction === "previous"
    ? { label: "‹", tooltip: m.command_open_previous() }
    : { label: "›", tooltip: m.command_open_next() };
}

export function definedNavigationConfigFor(
  target: DefinedNavigationConfig["target"],
  direction: DefinedNavigationConfig["direction"],
): DefinedNavigationConfig {
  return { target, direction, ...resolveDefinedNavigationAppearance({ target, direction }) };
}
