import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";
import { windowKinds } from "../custom-intervals/window-resolution";

import NoteletsBlock from "./ui/NoteletsBlock.vue";
import NoteletsBlockConfig from "./ui/NoteletsBlockConfig.vue";

const schema = v.object({
  window: v.optional(v.picklist(windowKinds), "day"),
  journals: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
  types: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
});

export type NoteletsBlockConfig = v.InferOutput<typeof schema>;
export type NoteletsBlockConfigChange = (config: NoteletsBlockConfig) => void;

export const noteletsBlock = defineViewBlock<NoteletsBlockConfig>({
  key: "notelets",
  label: () => m.view_block_notelets_label(),
  description: () => m.view_block_notelets_description(),
  icon: icons.entity.notelet,
  schema,
  defaultConfig: { window: "day" },
  component: NoteletsBlock,
  configComponent: NoteletsBlockConfig,
  summary: (config) => {
    const window = m.view_block_config_window_current({ period: config.window });
    const parts: string[] = [window];
    if (config.journals !== undefined)
      parts.push(m.view_block_summary_journal_count({ count: config.journals.length }));
    if (config.types !== undefined) parts.push(m.view_block_notelets_type_count({ count: config.types.length }));
    return parts.join(" · ");
  },
});
