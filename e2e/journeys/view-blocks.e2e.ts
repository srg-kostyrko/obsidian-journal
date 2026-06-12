import { $, browser, expect } from "@wdio/globals";

import { activeNotePath, waitForJournalFrontmatter } from "../support/vault.js";

import { openBlocksView, weekCalendar, WEEK_CALENDAR } from "./view-blocks.js";

// The Blocks view (e2e-views fixture) mounts the three blocks that never appear in the
// default Calendar view. The view-leaf mount is the real seam: a ribbon click renders
// the configured blocks in an Obsidian leaf.

describe("blocks view", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-views", plugins: ["journals"] });
  });

  describe("week-calendar block", () => {
    it("renders the week grid with its header and week-number cells", async () => {
      await openBlocksView();

      await expect($(WEEK_CALENDAR)).toBeExisting();
      await expect($(`${WEEK_CALENDAR} .notes-week-view`)).toBeExisting();
      await expect(weekCalendar.periodCell("week-number-cell")).toBeExisting();
      await expect(weekCalendar.periodCell("header-month")).toBeExisting();
    });

    it("creates and opens a day note when a week-grid day cell is clicked", async () => {
      await openBlocksView();

      // The week view renders only the focus (current) week, so read a real rendered
      // day cell's anchor rather than assuming a given day-of-month is in view.
      const dayCell = $(
        `${WEEK_CALENDAR} .notes-week-view__row .notes-calendar-cell:not(.notes-week-view__week-number)`,
      );
      await dayCell.waitForExist({ timeoutMsg: "no week-grid day cell rendered" });
      const anchor = (await dayCell.getAttribute("data-anchor")) ?? "";
      const path = `day/${anchor}.md`;

      await weekCalendar.cell(anchor).click();

      await waitForJournalFrontmatter(path, { journal: "daily", date: anchor });
      await weekCalendar.waitForActive(anchor);
      expect(await activeNotePath()).toBe(path);
    });
  });
});
