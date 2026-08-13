import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";

import CustomIntervalsBlock from "./ui/CustomIntervalsBlock.vue";
import CustomIntervalsBlockConfig from "./ui/CustomIntervalsBlockConfig.vue";
import { windowKinds } from "./window-resolution";

const schema = v.object({
  journals: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
  window: v.union([
    v.picklist(windowKinds),
    v.pipe(
      v.picklist(["current-week", "current-month", "current-quarter", "current-year"] as const),
      v.transform((legacy) => legacy.replace("current-", "") as (typeof windowKinds)[number]),
    ),
  ]),
});

export type CustomIntervalsConfig = v.InferOutput<typeof schema>;
export type CustomIntervalsConfigChange = (next: CustomIntervalsConfig) => void;

export const customIntervalsBlock = defineViewBlock<CustomIntervalsConfig>({
  key: "custom-intervals",
  label: () => m.common_custom_intervals(),
  description: () => m.view_block_custom_intervals_description(),
  icon: icons.entity.customInterval,
  schema,
  defaultConfig: { window: "month" },
  component: CustomIntervalsBlock,
  configComponent: CustomIntervalsBlockConfig,
  summary: (config) => {
    const window = m.view_block_config_window_current({ period: config.window });
    return config.journals && config.journals.length > 0
      ? `${window} · ${m.view_block_summary_journal_count({ count: config.journals.length })}`
      : window;
  },
});
