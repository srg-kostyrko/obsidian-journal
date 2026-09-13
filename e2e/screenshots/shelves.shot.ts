import { $, browser } from "@wdio/globals";

import { calendar, LIVE_LEAF, MONTH_VIEW, openCalendarView } from "../journeys/view.js";
import { openPalette, promptChoose } from "../support/commands.js";
import { activeNotePath, frontmatterOf, seedNote, todayAnchor, waitForActiveNote } from "../support/vault.js";

import { captureThemed, recordOutcome } from "./capture.js";

const VIEW_ROOT = `${LIVE_LEAF} .journal-view-root`;
const SHELF_SELECTOR_BUTTON = "button*=All journals";

// The office/work and home/personal journals both carry a has-note dot decoration (added to
// this fixture copy, absent from the base e2e-shelf-pick), so shelf scoping is visible on the
// calendar itself rather than only in which note a click opens.
function markCountFor(anchor: string): Promise<number> {
  return browser.execute(
    (view, dayAnchor) =>
      document.querySelectorAll(
        `${view} .notes-month-view__day[data-anchor="${CSS.escape(dayAnchor)}"] .shape-decoration`,
      ).length,
    MONTH_VIEW,
    anchor,
  );
}

describe("shelves examples", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-docs-shelves", plugins: ["journals"] });
  });

  it("scopes the calendar's decorated notes and note-open target to the picked shelf", async () => {
    const today = todayAnchor();
    await seedNote("work/" + today + ".md", `---\njournal: work\njournal-date: ${today}\n---\n`);
    await seedNote("personal/" + today + ".md", `---\njournal: personal\njournal-date: ${today}\n---\n`);

    await openCalendarView();
    await calendar.cell(today).waitForExist({ timeoutMsg: "today's cell did not render" });

    // Precondition: with no shelf picked ("All journals"), both journals are in scope, so
    // today's cell — connected to both a work and a personal note — carries both marks.
    await browser.waitUntil(async () => (await markCountFor(today)) === 2, {
      timeoutMsg: "expected today's cell to carry both journals' has-note marks before a shelf was picked",
    });
    const markCountAllJournals = await markCountFor(today);

    await $(SHELF_SELECTOR_BUTTON).click();
    const menu = $(".menu");
    await menu.waitForExist({ timeoutMsg: "shelf selector menu did not open" });
    await menu.$(".menu-item-title=office").click();
    const shelfButton = $("button*=office");
    await shelfButton.waitForExist({ timeoutMsg: "shelf selector button never showed office" });
    const shelfButtonLabelAfterPick = await shelfButton.getText();

    // Scoped to office (work only): personal's mark drops out, work's remains.
    await browser.waitUntil(async () => (await markCountFor(today)) === 1, {
      timeoutMsg: "expected only work's has-note mark once office was picked",
    });
    const markCountOffice = await markCountFor(today);

    await captureThemed(VIEW_ROOT, "shelves-selector");

    await calendar.cell(today).click();
    await waitForActiveNote(`work/${today}.md`);
    const clickedTodayCellOpened = await activeNotePath();

    await recordOutcome("shelves-selector", {
      today,
      markCountAllJournals,
      markCountOffice,
      shelfButtonLabelAfterPick,
      clickedTodayCellOpened,
    });
  });

  it("runs a shelf command that opens the shelf's day journal note", async () => {
    const today = todayAnchor();

    await openPalette();
    await promptChoose("Shelf: office: Open today");
    await waitForActiveNote(`work/${today}.md`);

    await recordOutcome("shelves-command", {
      paletteLabel: "Shelf: office: Open today",
      openedPath: `work/${today}.md`,
      frontmatter: await frontmatterOf(`work/${today}.md`),
    });
  });
});
