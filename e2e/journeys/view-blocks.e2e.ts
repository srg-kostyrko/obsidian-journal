import { $, $$, browser, expect } from "@wdio/globals";

import { activeNotePath, seedNote, waitForJournalFrontmatter } from "../support/vault.js";

import {
  CUSTOM_INTERVALS,
  DIVIDER,
  MARKDOWN_TEMPLATE,
  openBlocksView,
  weekCalendar,
  WEEK_CALENDAR,
} from "./view-blocks.js";

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

    it("renders a weekday header of seven labels above the week grid", async () => {
      await openBlocksView();

      await expect($$(`${WEEK_CALENDAR} .notes-week-view__weekday`)).toBeElementsArrayOfSize(7);
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

  describe("markdown-template block", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-views", plugins: ["journals"] });
      await seedNote("templates/view-template.md", "# View block template heading\n");
    });

    it("renders the template's content rather than the empty or error state", async () => {
      await openBlocksView();

      const block = $(MARKDOWN_TEMPLATE);
      await block.waitForExist({ timeoutMsg: "markdown-template block did not render" });
      await expect(block.$(".journal-view-markdown-template__empty")).not.toBeExisting();
      await expect(block.$(".journal-view-markdown-template__error")).not.toBeExisting();
      await expect(block.$("h1")).toHaveText("View block template heading");
    });
  });

  describe("divider block", () => {
    it("renders a separator element", async () => {
      await openBlocksView();
      await expect($(`${DIVIDER}[role="separator"]`)).toBeExisting();
    });
  });

  describe("custom-intervals block", () => {
    it("creates and opens the interval note when an un-created entry is clicked", async () => {
      await openBlocksView();

      // The sprint journal seeds no notes, so every rendered interval is un-created; its
      // "self" row must create-or-open rather than sit inert. Read a real entry's anchor
      // instead of assuming which sprint falls in the current year window.
      const entry = $(`${CUSTOM_INTERVALS} .journal-view-custom-intervals__entry`);
      await entry.waitForExist({ timeoutMsg: "no custom-interval entry rendered" });
      const anchor = (await entry.getAttribute("data-anchor")) ?? "";
      const path = `sprint/${anchor}.md`;

      await entry.$(".nav-row").click();

      await waitForJournalFrontmatter(path, { journal: "sprint", date: anchor });
      expect(await activeNotePath()).toBe(path);
    });
  });
});
