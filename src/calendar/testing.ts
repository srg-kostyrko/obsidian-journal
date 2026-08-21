import { moment } from "obsidian";

import { Calendar, CUSTOM_LOCALE, type WeekConfig } from "./calendar";
import { CalendarDate } from "./calendar-date";

import type { AnchorString } from "./types";

let installed: Calendar | undefined;

const DEFAULT_TEST_WEEK: WeekConfig = { dow: 1, doy: 4 };

export function installTestCalendar(week?: Partial<WeekConfig>): { teardown: () => void; calendar: Calendar } {
  // Reuse the installed instance: the Calendar constructor re-seeds CUSTOM_LOCALE from the system
  // locale, so a second `new Calendar()` inside one test discards the first's grid.
  const calendar = installed ?? new Calendar();
  calendar.applyWeekConfig(
    { dow: week?.dow ?? DEFAULT_TEST_WEEK.dow, doy: week?.doy ?? DEFAULT_TEST_WEEK.doy },
    { propagateToGlobal: false },
  );
  installed = calendar;
  return { calendar, teardown: resetCalendarLocale };
}

// Puts the week grid back to the value every test starts on. The global afterEach calls this, so a
// test that changed the grid cannot hand it to the next test in the same worker — which the previous
// afterAll-only reset allowed.
export function resetCalendarLocale(): void {
  if (!moment.locales().includes(CUSTOM_LOCALE)) return;
  installed?.applyWeekConfig(DEFAULT_TEST_WEEK, { propagateToGlobal: false });
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
