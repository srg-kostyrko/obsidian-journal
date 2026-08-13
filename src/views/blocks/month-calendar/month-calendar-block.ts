import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";
import { calendarBlockBaseSchema } from "../calendar-block-schema";
import { calendarBlockSummary } from "../calendar-block-summary";

import MonthCalendarBlock from "./ui/MonthCalendarBlock.vue";
import MonthCalendarBlockConfig from "./ui/MonthCalendarBlockConfig.vue";

const schema = v.object({
  ...calendarBlockBaseSchema,
  showHeading: v.optional(v.boolean(), true),
});

export type MonthCalendarConfig = v.InferOutput<typeof schema>;
export type MonthCalendarConfigChange = (next: MonthCalendarConfig) => void;

export const monthCalendarBlock = defineViewBlock<MonthCalendarConfig>({
  key: "month-calendar",
  label: () => m.view_block_month_calendar_label(),
  description: () => m.view_block_month_calendar_description(),
  icon: icons.entity.month,
  schema,
  defaultConfig: {
    before: 0,
    after: 0,
    hiddenWeekdays: [],
    weeks: "default" as const,
    showHeading: true,
  },
  component: MonthCalendarBlock,
  configComponent: MonthCalendarBlockConfig,
  summary: calendarBlockSummary,
});
