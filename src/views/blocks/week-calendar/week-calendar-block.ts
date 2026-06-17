import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";

import WeekCalendarBlock from "./ui/WeekCalendarBlock.vue";
import WeekCalendarBlockConfig from "./ui/WeekCalendarBlockConfig.vue";

const schema = v.object({
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hiddenWeekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), []),
  weeks: v.optional(v.picklist(["none", "left", "right"]), "left"),
});

export type WeekCalendarConfig = v.InferOutput<typeof schema>;
export type WeekCalendarConfigChange = (next: WeekCalendarConfig) => void;

export const weekCalendarBlock = defineViewBlock<WeekCalendarConfig>({
  key: "week-calendar",
  label: m.view_block_week_calendar_label(),
  description: m.view_block_week_calendar_description(),
  icon: icons.entity.week,
  schema,
  defaultConfig: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const },
  component: WeekCalendarBlock,
  configComponent: WeekCalendarBlockConfig,
});
