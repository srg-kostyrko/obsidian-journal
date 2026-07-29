import * as v from "valibot";

import { m } from "@/i18n";

import { defineToolbarItem } from "../../define-toolbar-item";

import SpacerItem from "./ui/SpacerItem.vue";

const schema = v.object({});

export const spacerItem = defineToolbarItem({
  key: "spacer",
  label: m.view_toolbar_spacer_label(),
  description: m.view_toolbar_spacer_description(),
  schema,
  defaultConfig: () => ({}),
  component: SpacerItem,
});
