import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineViewBlock } from "../../define-view-block";
import { calendarBlockBaseSchema } from "../calendar-block-schema";
import { calendarBlockSummary } from "../calendar-block-summary";

import WeekCalendarBlock from "./ui/WeekCalendarBlock.vue";
import WeekCalendarBlockConfig from "./ui/WeekCalendarBlockConfig.vue";

const schema = v.object({
  ...calendarBlockBaseSchema,
  showHeading: v.optional(v.boolean(), true),
});

export type WeekCalendarConfig = v.InferOutput<typeof schema>;
export type WeekCalendarConfigChange = (next: WeekCalendarConfig) => void;

export const weekCalendarBlock = defineViewBlock<WeekCalendarConfig>({
  key: "week-calendar",
  label: m.view_block_week_calendar_label(),
  description: m.view_block_week_calendar_description(),
  icon: icons.entity.week,
  schema,
  defaultConfig: {
    before: 0,
    after: 0,
    hiddenWeekdays: [],
    weeks: "default" as const,
    showHeading: true,
    followActiveDate: true,
  },
  component: WeekCalendarBlock,
  configComponent: WeekCalendarBlockConfig,
  summary: calendarBlockSummary,
});
