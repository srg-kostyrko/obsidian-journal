import * as v from "valibot";

import { m } from "@/i18n";

import { defineToolbarItem } from "../../define-toolbar-item";

import ShelfSelectorItem from "./ui/ShelfSelectorItem.vue";

const schema = v.object({});

export const shelfSelectorItem = defineToolbarItem({
  key: "shelf-selector",
  label: m.view_toolbar_shelf_selector_label(),
  description: m.view_toolbar_shelf_selector_description(),
  icon: "library",
  schema,
  defaultConfig: {},
  component: ShelfSelectorItem,
});
