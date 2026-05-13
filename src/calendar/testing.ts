import { moment } from "obsidian";

import { Calendar, type WeekConfig } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { AnchorString } from "./types";

export function installTestCalendar(week?: Partial<WeekConfig>): { teardown: () => void } {
  const priorLocale = moment.locale();
  new Calendar({ dow: week?.dow ?? 1, doy: week?.doy ?? 4 });

  return {
    teardown: () => {
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
