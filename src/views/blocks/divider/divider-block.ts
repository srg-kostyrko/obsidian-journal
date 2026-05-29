import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";

import DividerBlock from "./ui/DividerBlock.vue";

export const dividerBlock = defineViewBlock({
  key: "divider",
  label: m.view_block_divider_label(),
  icon: "minus",
  schema: v.object({}),
  defaultConfig: {},
  component: DividerBlock,
});
