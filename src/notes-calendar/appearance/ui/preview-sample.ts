import { MonthPeriod, type AnchorString, type CalendarDate } from "@/calendar";

import { CHIP_ORDER, type PartKey } from "../appearance-parts";

export interface PreviewSample {
  readonly month: MonthPeriod;
  readonly selected: AnchorString;
  readonly active: AnchorString;
  readonly decorated: readonly AnchorString[];
}

/**
 * Sample states relative to the real today, which the cell marks on its own through `useToday()`.
 * Today stands alone, so nothing layered over it hides an edit to Today. The open note's day is also
 * the selected one, as in a view whose selected date follows the open note.
 */
export function sampleDays(today: CalendarDate): PreviewSample {
  const month = MonthPeriod.containing(today);
  const ahead = today.shift(2, "d");
  const clamped = month.contains(ahead) ? ahead : month.end;
  // On the month's last day the clamp lands on today, which would layer the open note over Today.
  const active = clamped.isSame(today) ? today.shift(-2, "d") : clamped;
  const plain = [...month.days()].find((day) => !day.isSame(today) && !day.isSame(active)) ?? month.start;
  return {
    month,
    selected: active.toAnchor(),
    active: active.toAnchor(),
    decorated: [plain.toAnchor()],
  };
}

const STATES = ["active", "selected", "today", "outside"] as const;

const PREVIEW_PARTS: Readonly<Record<string, readonly PartKey[]>> = {
  date: ["date", "cell"],
  weekNumber: ["weekNumber"],
  weekday: ["weekday"],
  heading: ["heading"],
};

/** Every part the element belongs to, in the order a click should offer them. */
export function partsAt(target: Element): readonly PartKey[] {
  const parts = new Set<PartKey>();
  const cell = target.closest(".notes-calendar-cell");
  for (const state of STATES) if (cell?.hasAttribute(`data-${state}`) === true) parts.add(state);
  const part = target.closest<HTMLElement>("[data-preview-part]")?.dataset.previewPart;
  const keys = PREVIEW_PARTS[part ?? ""] ?? [];
  for (const key of keys) parts.add(key);
  const ordered = CHIP_ORDER.filter((key) => parts.has(key));
  // A day is mostly its state, so a state leads there; a label (the month name, a week number) is
  // what was clicked, so it leads and the today it contains follows.
  return part === "date" ? ordered : [...keys, ...ordered.filter((key) => !keys.includes(key))];
}
