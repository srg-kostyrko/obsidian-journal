import { moment } from "obsidian";

import { Calendar, CUSTOM_LOCALE, type WeekConfig } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { AnchorString } from "./types";

let installed: Calendar | undefined;

export function installTestCalendar(week?: Partial<WeekConfig>): { teardown: () => void; calendar: Calendar } {
  const priorLocale = moment.locale();
  const priorWeek = moment.locales().includes(CUSTOM_LOCALE)
    ? {
        dow: moment.localeData(CUSTOM_LOCALE).firstDayOfWeek(),
        doy: moment.localeData(CUSTOM_LOCALE).firstDayOfYear(),
      }
    : { dow: 1, doy: 4 };
  const calendar = new Calendar();
  calendar.applyWeekConfig({ dow: week?.dow ?? 1, doy: week?.doy ?? 4 }, { propagateToGlobal: false });
  installed = calendar;

  return {
    calendar,
    teardown: () => {
      installed = undefined;
      moment.updateLocale(CUSTOM_LOCALE, { week: priorWeek });
      moment.locale(priorLocale);
    },
  };
}

// moment's locale registry is process-global, so when test files share a worker's module registry
// the custom locale outlives the file that defined it and the next file silently inherits its week
// grid. Putting the custom locale back on the machine locale's week between files restores the
// starting point a file gets when it is the first one to touch the calendar.
export function resetCalendarLocale(): void {
  installed = undefined;
  if (!moment.locales().includes(CUSTOM_LOCALE)) return;
  const currentLocale = moment.locale();
  const machine = moment.localeData(currentLocale);
  moment.updateLocale(CUSTOM_LOCALE, {
    week: { dow: machine.firstDayOfWeek(), doy: machine.firstDayOfYear() },
  });
  moment.locale(currentLocale);
}

// Component tests must resolve this instance rather than constructing their own: the Calendar
// constructor re-seeds the custom locale's week from the system locale, so a fresh instance
// silently discards whatever installTestCalendar configured and the test asserts against the
// machine's locale instead of the one it asked for.
export function testCalendar(): Calendar {
  if (installed === undefined) {
    throw new Error("testCalendar() requires an active installTestCalendar()");
  }
  return installed;
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
