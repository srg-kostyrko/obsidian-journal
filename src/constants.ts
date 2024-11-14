import type { App } from "obsidian";
import { type InjectionKey } from "vue";
import type { ProvidedShelfData } from "./types/provided-data.types";
import type { JournalPlugin } from "./types/plugin.types";

export const CALENDAR_VIEW_TYPE = "journal-calendar";

export const FRONTMATTER_DATE_FORMAT = "YYYY-MM-DD";
export const FRONTMATTER_NAME_KEY = "journal";
export const FRONTMATTER_DATE_KEY = "journal-date";
export const FRONTMATTER_END_DATE_KEY = "journal-end-date";
export const FRONTMATTER_INDEX_KEY = "journal-index";

export const APP_KEY = Symbol() as InjectionKey<App>;
export const PLUGIN_KEY = Symbol() as InjectionKey<JournalPlugin>;
export const SHELF_DATA_KEY = Symbol() as InjectionKey<ProvidedShelfData>;
