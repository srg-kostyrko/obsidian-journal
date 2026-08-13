import { $ } from "@wdio/globals";

import { runCommand } from "../support/commands.js";

import { calendarSurface } from "./calendar.js";

const RIBBON_OPEN_CALENDAR = '[aria-label="Open Calendar"]';
// Re-clicking the ribbon leaves Obsidian's previous (deferred) calendar leaf in the
// DOM, hidden via inline `display: none`, so a bare `.notes-month-view` resolves to
// the stale copy. The live leaf is the one whose `.workspace-leaf` is not inline-
// hidden — independent of focus, which moves to the opened note (so `.mod-active`
// is wrong here).
export const LIVE_LEAF = '.workspace-leaf:not([style*="display: none"])';
export const MONTH_VIEW = `${LIVE_LEAF} .notes-month-view`;

// The view-leaf toolbar block, scoped to the live leaf so a stale hidden leaf's
// toolbar never shadows it.
export const TOOLBAR = `${LIVE_LEAF} .journal-view-toolbar`;

// The single view-leaf calendar surface, bound to the live-leaf month root.
export const calendar = calendarSurface(MONTH_VIEW);

// A view with showInRibbon on registers a left-ribbon button whose accessible name is its
// command name ("Open Calendar"). Clicking it is the real click path into the view-leaf
// mount — not executeCommandById. Only fixtures that pin showInRibbon can use this; the
// auto-seeded default view keeps the ribbon off by design (see openSeededCalendarView).
export async function openCalendarView(): Promise<void> {
  await $(RIBBON_OPEN_CALENDAR).click();
  await $(MONTH_VIEW).waitForExist({
    timeoutMsg: "calendar month view did not render after the Open Calendar ribbon click",
  });
}

// Fixtures with no persisted `views` get the auto-seeded default view, which has no ribbon
// icon, so its command is the only way in.
export async function openSeededCalendarView(): Promise<void> {
  await runCommand("journals:open-calendar");
  await $(MONTH_VIEW).waitForExist({
    timeoutMsg: "calendar month view did not render after the open-calendar command",
  });
}
