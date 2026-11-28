import { moment } from "obsidian";

import { AsyncResult } from "@/infrastructure/result";

import { Calendar, CUSTOM_LOCALE, isLocaleDefined, type WeekConfig } from "./calendar";
import { CalendarDate } from "./calendar-date";
import { userDateFormat } from "./user-date-format";

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

// Puts the week grid back to the value every test starts on, for a caller holding the `teardown`
// handle installTestCalendar returns — nothing else reaches it. A test that changed the grid cannot
// hand it to the next one regardless: the global beforeEach re-pins the grid before every test.
export function resetCalendarLocale(): void {
  if (!isLocaleDefined(CUSTOM_LOCALE)) return;
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

/** Moment's own reason for `pattern` failing to render today; call it inside `withoutEras`. */
export function formatFailureReason(pattern: string): string {
  const failure = CalendarDate.today().tryFormat(userDateFormat(pattern));
  if (failure.isOk()) throw new Error(`formatFailureReason(${JSON.stringify(pattern)}): the pattern rendered`);
  return failure.error.reason;
}

const pendingEraRestores = new Set<() => void>();

/** Puts back eras a `withoutEras` run still holds — the shared setup calls it after every test. */
export function restoreEras(): void {
  for (const restore of pendingEraRestores) restore();
}

// Reproduces #663: a locale whose era data is missing makes moment throw on any `y` token.
// An async `run`, or one returning an AsyncResult, keeps the eras removed until it settles, and
// restores them before the awaiting caller resumes.
export function withoutEras<T>(run: () => T): T {
  const locales = ["en", CUSTOM_LOCALE].filter((name) => isLocaleDefined(name)).map((name) => moment.localeData(name));
  const saved = locales.map((locale) => (locale as unknown as { _eras?: unknown })._eras);
  for (const locale of locales) (locale as unknown as { _eras?: unknown })._eras = undefined;
  const restore = (): void => {
    if (!pendingEraRestores.delete(restore)) return;
    for (const [i, locale] of locales.entries()) {
      (locale as unknown as { _eras?: unknown })._eras = saved[i];
    }
  };
  pendingEraRestores.add(restore);
  let result: T;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (result instanceof Promise) return result.finally(restore) as T;
  if (result instanceof AsyncResult) return result.tap(restore).tapErr(restore) as T;
  if (typeof (result as { then?: unknown } | null)?.then === "function") {
    restore();
    throw new TypeError("withoutEras: only a Promise or an AsyncResult can keep the eras removed");
  }
  restore();
  return result;
}
