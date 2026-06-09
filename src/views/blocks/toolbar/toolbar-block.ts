import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";

import ToolbarBlock from "./ui/ToolbarBlock.vue";

import type { BlockInstanceId } from "../../config";

export const toolbarItemSchema = v.object({
  id: v.pipe(
    v.string(),
    v.uuid(),
    v.transform((s) => s as BlockInstanceId),
  ),
  key: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
});

export type ToolbarItemInstance = v.InferOutput<typeof toolbarItemSchema>;

const schema = v.object({ items: v.array(toolbarItemSchema) });

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
