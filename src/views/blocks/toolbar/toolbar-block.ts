import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";

import ToolbarBlock from "./ui/ToolbarBlock.vue";

const itemSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

const schema = v.object({ items: v.array(itemSchema) });

type ToolbarConfig = v.InferOutput<typeof schema>;

export const toolbarBlock = defineViewBlock<ToolbarConfig>({
  key: "toolbar",
  label: m.view_block_toolbar_label(),
  description: m.view_block_toolbar_description(),
  icon: "panel-top",
  schema,
  defaultConfig: { items: [] },
  component: ToolbarBlock,
});
