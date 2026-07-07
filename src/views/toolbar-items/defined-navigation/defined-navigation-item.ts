import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineToolbarItem } from "../../define-toolbar-item";

import { DEFINED_NAVIGATION_TARGETS } from "./defined-navigation-targets";
import DefinedNavigationItem from "./ui/DefinedNavigationItem.vue";
import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

export { DEFINED_NAVIGATION_TARGETS } from "./defined-navigation-targets";

const schema = v.object({
  target: v.picklist(DEFINED_NAVIGATION_TARGETS),
  direction: v.picklist(["previous", "next"] as const),
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});

export type DefinedNavigationConfig = v.InferOutput<typeof schema>;
export type DefinedNavigationConfigChange = (next: DefinedNavigationConfig) => void;

export interface DefinedNavigationAppearance {
  readonly icon?: string;
  readonly label?: string;
  readonly tooltip: string;
}

export function resolveDefinedNavigationAppearance(config: DefinedNavigationConfig): DefinedNavigationAppearance {
  return config.direction === "previous"
    ? { label: "‹", tooltip: m.command_open_previous() }
    : { label: "›", tooltip: m.command_open_next() };
}

export const definedNavigationItem = defineToolbarItem<DefinedNavigationConfig>({
  key: "defined-navigation",
  label: m.view_toolbar_defined_navigation_label(),
  description: m.view_toolbar_defined_navigation_description(),
  icon: icons.block.definedNavigation,
  schema,
  defaultConfig: { target: "day", direction: "next" },
  component: DefinedNavigationItem,
  configComponent: DefinedNavigationItemConfig,
});
