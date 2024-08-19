import type { PluginSettings } from "./types/settings.types";

export const defaultPluginSettings: PluginSettings = {
  version: 2,
  journals: {},
  shelves: {},
  calendar: {
    firstDayOfWeek: -1,
    firstWeekOfYear: 1,
  },
  calendarView: {
    display: "month",
    leaf: "left",
    weeks: "left",
    todayMode: "navigate",
  },
};
