import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";

import { toolbarBlockSchema, type ToolbarConfig } from "./toolbar-config";
import ToolbarBlock from "./ui/ToolbarBlock.vue";

export const toolbarBlock = defineViewBlock<ToolbarConfig>({
  key: "toolbar",
  label: m.view_block_toolbar_label(),
  description: m.view_block_toolbar_description(),
  icon: icons.block.toolbar,
  schema: toolbarBlockSchema,
  defaultConfig: { items: [] },
  summary: (config) => m.view_block_toolbar_item_count({ count: config.items.length }),
  component: ToolbarBlock,
});
