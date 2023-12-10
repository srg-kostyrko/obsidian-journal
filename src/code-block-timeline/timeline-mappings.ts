import { CodeBlockCalendar } from "./code-block-calendar";
import { CodeBlockMonth } from "./code-block-month";
import { CodeBlockQuarter } from "./code-block-quarter";
import { CodeBlockWeek } from "./code-block-week";

export const timelineModes = {
  month: CodeBlockMonth,
  week: CodeBlockWeek,
  quarter: CodeBlockQuarter,
  calendar: CodeBlockCalendar,
};

export const timelineGranularityMapping = {
  day: "week",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "calendar",
};
