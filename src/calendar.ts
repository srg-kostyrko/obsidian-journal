import { moment } from "obsidian";
import { extractCurrentlocaleData } from "./utils/moment";
import { calendarSettings$ } from "./stores/settings.store";
import type { MomentDate } from "./types/date.types";

const CUSTOM_LOCALE = "custom-journal-locale";

export function initCalendarCustomization(): void {
  if (!moment.locales().includes(CUSTOM_LOCALE)) {
    const currentLocale = moment.locale();
    moment.defineLocale(CUSTOM_LOCALE, extractCurrentlocaleData());
    moment.locale(currentLocale);
  }
}

export function date(date?: string, format?: string): MomentDate {
  const md = date ? moment(date, format) : moment();
  if (calendarSettings$.value.firstDayOfWeek !== -1) {
    md.locale(CUSTOM_LOCALE);
  }
  return md;
}

export function today(): MomentDate {
  const md = moment();
  if (calendarSettings$.value.firstDayOfWeek !== -1) {
    md.locale(CUSTOM_LOCALE);
  }
  return md.startOf("day");
}

export function updateLocale(): void {
  const currentLocale = moment.locale();
  moment.updateLocale(CUSTOM_LOCALE, {
    week: {
      dow: calendarSettings$.value.firstDayOfWeek,
      doy: 7 + calendarSettings$.value.firstDayOfWeek - (calendarSettings$.value.firstWeekOfYear ?? 1),
    },
  });
  moment.locale(currentLocale);
}
