import { $ } from "@wdio/globals";

import { calendarSurface } from "./calendar.js";
import { LIVE_LEAF } from "./view.js";

const RIBBON_OPEN_BLOCKS = '[aria-label="Open Blocks"]';

export const WEEK_CALENDAR = `${LIVE_LEAF} .journal-view-week-calendar`;
export const MARKDOWN_TEMPLATE = `${LIVE_LEAF} .journal-view-markdown-template`;
export const DIVIDER = `${LIVE_LEAF} .journal-view-divider`;

// The week view's day cells are bare `.notes-calendar-cell`s in the row; the
// week-number cell is also a `.notes-calendar-cell`, so exclude it by its class.
export const weekCalendar = calendarSurface(
  `${LIVE_LEAF} .notes-week-view`,
  ".notes-week-view__row .notes-calendar-cell:not(.notes-week-view__week-number)",
);

export async function openBlocksView(): Promise<void> {
  await $(RIBBON_OPEN_BLOCKS).click();
  await $(WEEK_CALENDAR).waitForExist({
    timeoutMsg: "Blocks view did not render after the Open Blocks ribbon click",
  });
}
