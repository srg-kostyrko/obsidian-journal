import { type InjectionKey } from "vue";
import type { ProvidedShelfData } from "./types/provided-data.types";
import type { JournalPlugin } from "./types/plugin.types";
import type { JournalSettings } from "./types/settings.types";

export const CALENDAR_VIEW_TYPE = "journal-calendar";

export const FRONTMATTER_DATE_FORMAT = "YYYY-MM-DD";
export const FRONTMATTER_NAME_KEY = "journal";
export const FRONTMATTER_DATE_KEY = "journal-date";
export const FRONTMATTER_START_DATE_KEY = "journal-start-date";
export const FRONTMATTER_END_DATE_KEY = "journal-end-date";
export const FRONTMATTER_INDEX_KEY = "journal-index";

export const PLUGIN_KEY = Symbol() as InjectionKey<JournalPlugin>;
export const SHELF_DATA_KEY = Symbol() as InjectionKey<ProvidedShelfData>;

export const calendarFormats: Record<JournalSettings["write"]["type"], string> = {
  day: "D",
  week: "[W]W",
  month: "MMMM",
  quarter: "[Q]Q",
  year: "YYYY",
  weekdays: "ddd",
  custom: "",
};
