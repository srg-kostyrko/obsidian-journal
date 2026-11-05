import { $, browser, expect } from "@wdio/globals";

import { runCommand } from "../support/commands.js";
import { waitForState } from "../support/wait.js";

import { calendarSurface } from "./calendar.js";

import type { WorkspaceLeaf } from "obsidian";

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
  await waitForViewPlaced();
}

// Fixtures with no persisted `views` get the auto-seeded default view, which has no ribbon
// icon, so its command is the only way in.
export async function openSeededCalendarView(): Promise<void> {
  await runCommand("journals:open-calendar");
  await $(MONTH_VIEW).waitForExist({
    timeoutMsg: "calendar month view did not render after the open-calendar command",
  });
  await waitForViewPlaced();
}

// Revealing a sidebar leaf expands its split on an animation, and the view mounts before it
// ends, so the grid slides sideways while the split widens — 44px, more than a column, as
// measured. WebDriver reads a click's coordinates once, so a click sent mid-slide lands on the
// neighboring day. Obsidian marks the animation itself: `expand()` sets an inline
// `overflow: hidden` on the split and clears it on completion (1.8.7 through 1.15.0).
async function waitForViewPlaced(): Promise<void> {
  await waitForState(
    () =>
      browser.execute((selector: string) => {
        const view = document.querySelector(selector);
        if (!view) return null;
        const dock = view.closest<HTMLElement>(".mod-sidedock");
        if (!dock) return true;
        return !dock.classList.contains("is-sidedock-collapsed") && dock.style.overflow !== "hidden";
      }, MONTH_VIEW),
    (placed) => placed,
    "the calendar's sidebar did not finish expanding",
  );
}

// Opens a copy of the main window's journal view in a popout and waits for its month grid.
export async function openCalendarInPopout(): Promise<void> {
  const opened = await browser.executeObsidian(async ({ app }) => {
    const workspace = app.workspace as typeof app.workspace & {
      iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void;
    };
    const mainWindow = workspace.containerEl.ownerDocument.defaultView;
    let source: WorkspaceLeaf | undefined;
    workspace.iterateAllLeaves((leaf) => {
      if (
        leaf.view.containerEl.ownerDocument.defaultView === mainWindow &&
        leaf.view.getViewType().startsWith("journal-view:")
      ) {
        source = leaf;
      }
    });
    if (!source) return false;
    const popout = workspace.openPopoutLeaf();
    await popout.setViewState(source.getViewState());
    return true;
  });
  expect(opened).toBe(true);
  await browser.waitUntil(
    () =>
      browser.executeObsidian(({ app }) => {
        const workspace = app.workspace as typeof app.workspace & {
          iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void;
        };
        const mainWindow = workspace.containerEl.ownerDocument.defaultView;
        let rendered = false;
        workspace.iterateAllLeaves((leaf) => {
          if (leaf.view.containerEl.ownerDocument.defaultView === mainWindow) return;
          rendered ||= leaf.view.containerEl.querySelector(".notes-month-view") !== null;
        });
        return rendered;
      }),
    { timeoutMsg: "calendar view did not render in the popout window" },
  );
}
