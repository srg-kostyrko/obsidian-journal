import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";

import CustomIntervalsBlock from "./ui/CustomIntervalsBlock.vue";
import CustomIntervalsBlockConfig from "./ui/CustomIntervalsBlockConfig.vue";

const schema = v.object({
  journals: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
  window: v.picklist(["current-week", "current-month", "current-quarter", "current-year"] as const),
  hideEmpty: v.boolean(),
});

export type CustomIntervalsConfig = v.InferOutput<typeof schema>;
export type CustomIntervalsConfigChange = (next: CustomIntervalsConfig) => void;

export const customIntervalsBlock = defineViewBlock<CustomIntervalsConfig>({
  key: "custom-intervals",
  label: m.view_block_custom_intervals_label(),
  description: m.view_block_custom_intervals_description(),
  icon: "list",
  schema,
  defaultConfig: { window: "current-month", hideEmpty: true },
  component: CustomIntervalsBlock,
  configComponent: CustomIntervalsBlockConfig,
});
