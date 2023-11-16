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
    folderType: "manual",
    folder: "",
    folderTemplate: "{{date}}",
  },
  weekly: {
    enabled: false,
    firstDayOfWeek: "monday",
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-[W]ww",
    folderType: "manual",
    folder: "",
    folderTemplate: "{{date}}",
  },
  monthly: {
    enabled: false,
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-MM",
    folderType: "manual",
    folder: "",
    folderTemplate: "{{date}}",
  },
  quarterly: {
    enabled: false,
    titleTemplate: "{{date}}",
    dateFormat: "YYYY-[Q]Q",
    folderType: "manual",
    folder: "",
    folderTemplate: "{{date}}",
  },
  yearly: {
    enabled: false,
    titleTemplate: "YYYY",
    dateFormat: "YYYY-MM-DD",
    folderType: "manual",
    folder: "",
    folderTemplate: "{{date}}",
  },
};
