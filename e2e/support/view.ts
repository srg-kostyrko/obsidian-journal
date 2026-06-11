import { $ } from "@wdio/globals";

import { waitForState } from "./wait.js";

const RIBBON_OPEN_CALENDAR = '[aria-label="Open Calendar"]';
const MONTH_VIEW = ".notes-month-view";

// The auto-seeded default view registers a left-ribbon button whose accessible
// name is its command name ("Open Calendar"). Clicking it is the real click path
// (slice-B seam b) into the view-leaf mount — not executeCommandById.
export async function openCalendarView(): Promise<void> {
  await $(RIBBON_OPEN_CALENDAR).click();
  await $(MONTH_VIEW).waitForExist({
    timeoutMsg: "calendar month view did not render after the Open Calendar ribbon click",
  });
}

// Day cells carry no stable data-testid (a day number repeats across month spill),
// so they are pinned by the data-anchor production hook.
export function dayCell(anchor: string): ReturnType<typeof $> {
  return $(`${MONTH_VIEW} .notes-month-view__day[data-anchor="${anchor}"]`);
}

// Header (month/quarter/year) and week-number cells already carry production
// data-testid hooks; exactly one of each renders in a month.
export function periodCell(
  testId: "header-month" | "header-quarter" | "header-year" | "week-number-cell",
): ReturnType<typeof $> {
  return $(`${MONTH_VIEW} [data-testid="${testId}"]`);
}

// The cell flips data-active="true" off the live active-note-changed event the
// moment its note becomes active — poll the attribute, never sleep.
export function waitForActiveCell(anchor: string): Promise<void> {
  return waitForState(
    async () => (await dayCell(anchor).getAttribute("data-active")) ?? undefined,
    (active) => active === "true",
    `waited for the ${anchor} day cell to become data-active`,
  );
}
