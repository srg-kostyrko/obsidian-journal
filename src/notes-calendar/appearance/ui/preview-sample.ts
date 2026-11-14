import { MonthPeriod, WeekPeriod, type AnchorString, type CalendarDate } from "@/calendar";

import { CHIP_ORDER, type PartKey } from "../appearance-parts";

export interface PreviewSample {
  readonly month: MonthPeriod;
  readonly selected: AnchorString;
  readonly active: AnchorString;
  readonly decorated: readonly AnchorString[];
}

/** Sample states around the real today, each on a day of its own. */
export function sampleDays(today: CalendarDate, weekend: ReadonlySet<number>): PreviewSample {
  const month = MonthPeriod.containing(today);
  const ahead = today.shift(2, "d");
  const clamped = month.contains(ahead) ? ahead : month.end;
  // On the month's last day the clamp lands on today, which would layer the open note over Today.
  const active = clamped.isSame(today) ? today.shift(-2, "d") : clamped;
  // A day of its own: the open note outranks Selected's text and fills under its accent ring, so a
  // shared day would hide edits to Selected. It carries the decoration, which Selected draws over.
  // A weekend day in today's week where there is one, so this one day also shows Current week and Weekends.
  const free = (day: CalendarDate): boolean => month.contains(day) && !day.isSame(today) && !day.isSame(active);
  const selected =
    [...WeekPeriod.containing(today).days()].find((day) => free(day) && weekend.has(day.weekday())) ??
    [...month.days()].find(free) ??
    month.start;
  return {
    month,
    selected: selected.toAnchor(),
    active: active.toAnchor(),
    decorated: [selected.toAnchor()],
  };
}

const STATES = [
  ["active", "data-active"],
  ["selected", "data-selected"],
  ["today", "data-today"],
  ["currentWeek", "data-current-week"],
  ["weekend", "data-weekend"],
  ["outside", "data-outside"],
] as const;

const PREVIEW_PARTS: Readonly<Record<string, readonly PartKey[]>> = {
  date: ["date", "cell"],
  weekNumber: ["weekNumber"],
  weekday: ["weekday"],
  heading: ["heading"],
  // A hidden outside day leaves a blank, which is the only way back to the setting that hid it.
  outside: ["outside"],
};

/** Every part the element belongs to, in the order a click should offer them. */
export function partsAt(target: Element): readonly PartKey[] {
  const parts = new Set<PartKey>();
  // A weekend column's header is no cell but carries the band's state all the same.
  const cell = target.closest(".notes-calendar-cell, [data-preview-part='weekday']");
  for (const [state, attribute] of STATES) if (cell?.hasAttribute(attribute) === true) parts.add(state);
  const part = target.closest<HTMLElement>("[data-preview-part]")?.dataset.previewPart;
  const keys = PREVIEW_PARTS[part ?? ""] ?? [];
  for (const key of keys) parts.add(key);
  if (target.closest("[data-preview-grid]") !== null) parts.add("grid");
  const ordered = CHIP_ORDER.filter((key) => parts.has(key));
  // A day is mostly its state, so a state leads there; a label (the month name, a week number) is
  // what was clicked, so it leads and the today it contains follows.
  return part === "date" || part === "weekday" ? ordered : [...keys, ...ordered.filter((key) => !keys.includes(key))];
}
