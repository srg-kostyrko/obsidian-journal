import * as v from "valibot";

import { m } from "@/i18n";
import { climb } from "@/settings/repair";

import { EXISTING_NAVIGATION_TARGETS } from "./existing-navigation-targets";

import type { ToolbarItemAppearance } from "../appearance";

const elsewhere = "a navigation that goes elsewhere is worse than none";

export const existingNavigationSchema = v.object({
  target: v.pipe(v.picklist(EXISTING_NAVIGATION_TARGETS), climb(elsewhere)),
  direction: v.pipe(v.picklist(["previous", "next"] as const), climb(elsewhere)),
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});

export type ExistingNavigationConfig = v.InferOutput<typeof existingNavigationSchema>;
export type ExistingNavigationConfigChange = (next: ExistingNavigationConfig) => void;

export function resolveExistingNavigationAppearance(config: ExistingNavigationConfig): ToolbarItemAppearance {
  return config.direction === "previous"
    ? { label: "‹", tooltip: m.command_open_previous() }
    : { label: "›", tooltip: m.command_open_next() };
}

export function existingNavigationConfigFor(
  target: ExistingNavigationConfig["target"],
  direction: ExistingNavigationConfig["direction"],
): ExistingNavigationConfig {
  return { target, direction, ...resolveExistingNavigationAppearance({ target, direction }) };
}
