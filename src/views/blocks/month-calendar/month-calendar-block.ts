import * as v from "valibot";

import { m } from "@/i18n";

import { defineViewBlock } from "../../define-view-block";

import MonthCalendarBlock from "./ui/MonthCalendarBlock.vue";
import MonthCalendarBlockConfig from "./ui/MonthCalendarBlockConfig.vue";

const schema = v.object({
  before: v.pipe(v.number(), v.integer(), v.minValue(0)),
  after: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hiddenWeekdays: v.optional(v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))), []),
  weeks: v.optional(v.picklist(["none", "left", "right"]), "left"),
});

export type MonthCalendarConfig = v.InferOutput<typeof schema>;
export type MonthCalendarConfigChange = (next: MonthCalendarConfig) => void;

export const monthCalendarBlock = defineViewBlock<MonthCalendarConfig>({
  key: "month-calendar",
  label: m.view_block_month_calendar_label(),
  description: m.view_block_month_calendar_description(),
  icon: "calendar-days",
  schema,
  defaultConfig: { before: 0, after: 0, hiddenWeekdays: [], weeks: "left" as const },
  component: MonthCalendarBlock,
  configComponent: MonthCalendarBlockConfig,
});
