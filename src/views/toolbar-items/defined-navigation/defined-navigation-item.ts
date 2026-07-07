import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineToolbarItem } from "../../define-toolbar-item";

import { definedNavigationSchema, type DefinedNavigationConfig } from "./defined-navigation-config";
import DefinedNavigationItem from "./ui/DefinedNavigationItem.vue";
import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

export { DEFINED_NAVIGATION_TARGETS } from "./defined-navigation-targets";

export const definedNavigationItem = defineToolbarItem<DefinedNavigationConfig>({
  key: "defined-navigation",
  label: m.view_toolbar_defined_navigation_label(),
  description: m.view_toolbar_defined_navigation_description(),
  icon: icons.block.definedNavigation,
  schema: definedNavigationSchema,
  defaultConfig: { target: "day", direction: "next" },
  component: DefinedNavigationItem,
  configComponent: DefinedNavigationItemConfig,
});
