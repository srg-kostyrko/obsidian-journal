import { CalendarConfig } from "../contracts/config.types";

export const DEFAULT_CONFIG_CALENDAR: Omit<CalendarConfig, "id"> = {
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
    template: "",
  },
  weekly: {
    enabled: false,
    firstDayOfWeek: "monday",
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-[W]ww",
    folder: "",
    template: "",
  },
  monthly: {
    enabled: false,
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-MM",
    folder: "",
    template: "",
  },
  quarterly: {
    enabled: false,
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-[Q]Q",
    folder: "",
    template: "",
  },
  yearly: {
    enabled: false,
    titleTemplate: "YYYY",
    dateFormat: "YYYY-MM-DD",
    folder: "",
    template: "",
  },
};
