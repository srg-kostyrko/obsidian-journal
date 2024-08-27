import type { JournalSettings } from "../types/settings.types";

export const supportedJournalCommands: Record<JournalSettings["write"]["type"], { label: string; value: string }[]> = {
  day: [
    { label: "Open today's note", value: "same" },
    { label: "Open tomorrow's note", value: "next" },
    { label: "Open yesterday's note", value: "previous" },
    { label: "Open same day next week", value: "same_next_week" },
    { label: "Open same day last week", value: "same_previous_week" },
    { label: "Open same day next month", value: "same_next_month" },
    { label: "Open same day last month", value: "same_previous_month" },
    { label: "Open same day next year", value: "same_next_year" },
    { label: "Open same day last year", value: "same_previous_year" },
  ],
  week: [
    { label: "Open current weeks's note", value: "same" },
    { label: "Open next week's note", value: "next" },
    { label: "Open last week's note", value: "previous" },
  ],
  month: [
    { label: "Open current month's note", value: "same" },
    { label: "Open next month's note", value: "next" },
    { label: "Open last month's note", value: "previous" },
    { label: "Open same month next year", value: "same_next_year" },
    { label: "Open same month last year", value: "same_previous_year" },
  ],
  quarter: [
    { label: "Open current quarter's note", value: "same" },
    { label: "Open next quarter's note", value: "next" },
    { label: "Open last quarter's note", value: "previous" },
    { label: "Open same quarter next year", value: "same_next_year" },
    { label: "Open same quarter last year", value: "same_previous_year" },
  ],
  year: [
    { label: "Open this year's note", value: "same" },
    { label: "Open next year's note", value: "next" },
    { label: "Open last year's note", value: "previous" },
  ],
  weekdays: [],
  custom: [],
};

export const buildSupportedCommandList = (write: JournalSettings["write"]) => {
  return supportedJournalCommands[write.type];
};
