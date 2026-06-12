import { $ } from "@wdio/globals";

import { waitForState } from "../support/wait.js";

export type CellLocator = ReturnType<typeof $>;
export type PeriodTestId = "header-month" | "header-quarter" | "header-year" | "week-number-cell";

export interface CalendarSurface {
  // A day number repeats across month spill, so day cells are pinned by the
  // data-anchor production hook and scoped to the day grid (a week anchor can
  // coincide with a day anchor; .notes-month-view__day disambiguates).
  cell(anchor: string): CellLocator;
  // Header (month/quarter/year) and week-number cells carry production data-testid
  // hooks. The three header cells render once each; week-number-cell repeats per
  // row, so $() resolves to the first week — fine while callers only need "a week
  // note", not a specific row.
  periodCell(testId: PeriodTestId): CellLocator;
  // The cell flips data-active="true" off the live active-note-changed event — poll.
  waitForActive(anchor: string): Promise<void>;
}

// Binds the calendar mount root once so cell-finding isn't re-threaded through every
// call. The view-leaf and (chunk 2) code-block mounts each construct one against
// their own root and share every method.
// The day-cell scope differs per mount: the month grid wraps each cell in
// `.notes-month-view__day`; the week view renders bare `.notes-calendar-cell`s in its
// row. Callers pass the scope so a week anchor that coincides with a day anchor never
// resolves to the wrong cell.
export function calendarSurface(root: string, daySelector = ".notes-month-view__day"): CalendarSurface {
  const cell = (anchor: string): CellLocator => $(`${root} ${daySelector}[data-anchor="${anchor}"]`);
  const periodCell = (testId: PeriodTestId): CellLocator => $(`${root} [data-testid="${testId}"]`);
  const waitForActive = (anchor: string): Promise<void> =>
    waitForState(
      async () => (await cell(anchor).getAttribute("data-active")) ?? undefined,
      (active) => active === "true",
      `waited for the ${anchor} day cell to become data-active`,
    );
  return { cell, periodCell, waitForActive };
}
