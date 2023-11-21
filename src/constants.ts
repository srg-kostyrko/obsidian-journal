import { CalendarGranularity, SectionName } from "./contracts/config.types";

export const FRONTMATTER_DATE_FORMAT = "YYYY-MM-DD";
export const FRONTMATTER_ID_KEY = "journal";
export const FRONTMATTER_DATE_KEY = "journal-date";
export const FRONTMATTER_META_KEY = "journal-meta";

export const SECTIONS_MAP: Record<CalendarGranularity, SectionName> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  quarter: "quarterly",
  year: "yearly",
};
