import { moment } from "obsidian";

import { Calendar, CUSTOM_LOCALE, type WeekConfig } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { AnchorString } from "./types";

export function installTestCalendar(week?: Partial<WeekConfig>): { teardown: () => void } {
  const priorLocale = moment.locale();
  const priorWeek = moment.locales().includes(CUSTOM_LOCALE)
    ? {
        dow: moment.localeData(CUSTOM_LOCALE).firstDayOfWeek(),
        doy: moment.localeData(CUSTOM_LOCALE).firstDayOfYear(),
      }
    : { dow: 1, doy: 4 };
  const calendar = new Calendar();
  calendar.applyWeekConfig({ dow: week?.dow ?? 1, doy: week?.doy ?? 4 }, { propagateToGlobal: false });

  return {
    teardown: () => {
      moment.updateLocale(CUSTOM_LOCALE, { week: priorWeek });
      moment.locale(priorLocale);
    },
  };
}

export function anchor(s: string): AnchorString {
  return s as AnchorString;
}

export function date(s: string): CalendarDate {
  const result = CalendarDate.parse(s);
  if (result.kind === "err") {
    throw new Error(`fixture date(${JSON.stringify(s)}) failed to parse: ${result.error.message}`);
  }
  return result.value;
}
