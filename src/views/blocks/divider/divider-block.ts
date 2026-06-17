import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";

import DividerBlock from "./ui/DividerBlock.vue";

export const dividerBlock = defineViewBlock({
  key: "divider",
  label: m.view_block_divider_label(),
  icon: icons.block.divider,
  schema: v.object({}),
  defaultConfig: {},
  component: DividerBlock,
});
