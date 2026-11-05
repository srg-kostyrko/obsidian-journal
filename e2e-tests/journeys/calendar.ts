import { $, browser } from "@wdio/globals";

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

// The label's color goes through color-mix, which Chromium serializes as color(srgb …) and
// WebDriver cannot parse to hex, so the page paints it on a canvas and reads the pixel back.
export async function labelHexOf(cellSelector: string): Promise<string | undefined> {
  const hex = await browser.execute((selector: string) => {
    const label = document.querySelector(`${selector} .cell-decoration__content`);
    const context = document.createElement("canvas").getContext("2d");
    if (label === null || context === null) return null;
    const color = getComputedStyle(label).color;
    // A color the canvas rejects leaves fillStyle on its preset; two presets both surviving means
    // the read failed, and the raw value goes back so it can never equal a hex.
    const rejected = ["#010203", "#040506"].every((preset) => {
      context.fillStyle = preset;
      context.fillStyle = color;
      return context.fillStyle === preset;
    });
    if (rejected) return color;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }, cellSelector);
  return hex ?? undefined;
}
