import type { WeekendSetting } from "./settings/display-slice";

const SATURDAY_SUNDAY: readonly number[] = [0, 6];

interface WeekInfo {
  weekend?: unknown;
}
interface WeekInfoLocale {
  getWeekInfo?: () => WeekInfo;
  weekInfo?: WeekInfo;
}

// Intl numbers days 1 = Monday … 7 = Sunday; moment's `d` is 0 = Sunday.
export function localeWeekend(locale: string): readonly number[] {
  try {
    const intl = new Intl.Locale(locale) as unknown as WeekInfoLocale;
    // Older runtimes expose a `weekInfo` getter instead of the method.
    const info = typeof intl.getWeekInfo === "function" ? intl.getWeekInfo() : intl.weekInfo;
    const days = Array.isArray(info?.weekend)
      ? [...new Set((info.weekend as unknown[]).filter((n): n is number => Number.isSafeInteger(n)).map((n) => n % 7))]
      : [];
    return days.length > 0 ? days.toSorted((a, b) => a - b) : SATURDAY_SUNDAY;
  } catch {
    return SATURDAY_SUNDAY;
  }
}

export function resolveWeekend(setting: WeekendSetting, locale: string): ReadonlySet<number> {
  return new Set(setting.type === "custom" ? setting.days : localeWeekend(locale));
}

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** The weekend's day names Monday first whatever the grid, so a Sunday-start week still reads "Saturday and Sunday". */
export function weekendDayNames(weekend: ReadonlySet<number>, weekdayNames: readonly string[]): string[] {
  return MONDAY_FIRST.filter((day) => weekend.has(day)).map((day) => weekdayNames[day] ?? "");
}

/** Maximal runs of adjacent weekend columns, as indexes among the visible day columns. */
export function weekendRuns(
  columns: readonly number[],
  weekend: ReadonlySet<number>,
): readonly { start: number; span: number }[] {
  const runs: { start: number; span: number }[] = [];
  let open: { start: number; span: number } | undefined;
  for (const [index, day] of columns.entries()) {
    if (!weekend.has(day)) open = undefined;
    else if (open) open.span += 1;
    else {
      open = { start: index, span: 1 };
      runs.push(open);
    }
  }
  return runs;
}
