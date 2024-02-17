import { CalendarGranularity } from "./contracts/config.types";

export const FRONTMATTER_DATE_FORMAT = "YYYY-MM-DD";
export const FRONTMATTER_ID_KEY = "journal";
export const FRONTMATTER_START_DATE_KEY = "journal-start-date";
export const FRONTMATTER_END_DATE_KEY = "journal-end-date";
export const FRONTMATTER_SECTION_KEY = "journal-section";
export const FRONTMATTER_INDEX_KEY = "journal-interval-index";

export const SECTIONS_MAP: Record<CalendarGranularity, string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  quarter: "quarterly",
  year: "yearly",
};

export const FRONTMATTER_ADDING_DELAY = 800;
