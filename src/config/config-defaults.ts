import { CalendarConfig } from "../contracts/config.types";

export const DEFAULT_CONFIG_CALENDAR: CalendarConfig = {
  type: "calendar",
  name: "Journal",
  rootFolder: "",
  openOnStartup: false,
  startupSection: "daily",

  daily: {
    enabled: true,
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-MM-DD",
    folder: "",
  },
  weekly: {
    enabled: false,
    firstDayOfWeek: "monday",
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-[W]ww",
    folder: "",
  },
  monthly: {
    enabled: false,
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-MM",
    folder: "",
  },
  quarterly: {
    enabled: false,
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-[Q]Q",
    folder: "",
  },
  yearly: {
    enabled: false,
    titleTemplate: "YYYY",
    dateFormat: "YYYY-MM-DD",
    folder: "",
  },
};
