import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineToolbarItem } from "../../define-toolbar-item";

import {
  existingNavigationConfigFor,
  existingNavigationSchema,
  type ExistingNavigationConfig,
} from "./existing-navigation-config";
import ExistingNavigationItem from "./ui/ExistingNavigationItem.vue";
import ExistingNavigationItemConfig from "./ui/ExistingNavigationItemConfig.vue";

export { EXISTING_NAVIGATION_TARGETS } from "./existing-navigation-targets";

export const existingNavigationItem = defineToolbarItem<ExistingNavigationConfig>({
  key: "existing-navigation",
  label: () => m.view_toolbar_existing_navigation_label(),
  description: () => m.view_toolbar_existing_navigation_description(),
  icon: icons.block.existingNavigation,
  schema: existingNavigationSchema,
  defaultConfig: () => existingNavigationConfigFor("day", "next"),
  component: ExistingNavigationItem,
  configComponent: ExistingNavigationItemConfig,
});
