import { browser, expect } from "@wdio/globals";

import {
  activeNotePath,
  waitForActiveNoteIn,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

import { calendar, openCalendarView } from "./view.js";

// Slice B chunk 0 — the view-leaf render + real ribbon-click seam. Our Vue calendar
// mounts in a real Obsidian leaf, a real ribbon click opens it, and a real cell
// click drives OpenDateFlow -> note create+open. None of this is reachable through
// __mocks__/obsidian.ts, which renders no leaf and has no ribbon.

// The grid defaults to the current local month; the 15th is always an in-month,
// actionable day cell, far from any month boundary, and won't be "today" on most
// runs (keeping data-active visibly distinct from data-today). Node and Obsidian
// share the OS clock, so the computed year-month matches the rendered grid.
function midMonthAnchor(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
}

describe("calendar view journeys", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  it("creates, opens, and live-activates a day note when its calendar cell is clicked", async () => {
    const anchor = midMonthAnchor();
    const path = `day/${anchor}.md`;

    await openCalendarView();
    await calendar.cell(anchor).click();

    await waitForJournalFrontmatter(path, { journal: "daily", date: anchor });
    await calendar.waitForActive(anchor);
    expect(await activeNotePath()).toBe(path);
  });

  it("creates and opens a week note when the week-number cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("week-number-cell").click();

    const path = await waitForActiveNoteIn("week");
    await waitForFrontmatter(path, (fm) => fm.journal === "weekly", `waited for ${path} to attach journal=weekly`);
  });

  it("creates and opens a month note when the month header cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("header-month").click();

    const path = await waitForActiveNoteIn("month");
    await waitForFrontmatter(path, (fm) => fm.journal === "monthly", `waited for ${path} to attach journal=monthly`);
  });

  it("creates and opens a quarter note when the quarter header cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("header-quarter").click();

    const path = await waitForActiveNoteIn("quarter");
    await waitForFrontmatter(
      path,
      (fm) => fm.journal === "quarterly",
      `waited for ${path} to attach journal=quarterly`,
    );
  });

  it("creates and opens a year note when the year header cell is clicked", async () => {
    await openCalendarView();
    await calendar.periodCell("header-year").click();

    const path = await waitForActiveNoteIn("year");
    await waitForFrontmatter(path, (fm) => fm.journal === "yearly", `waited for ${path} to attach journal=yearly`);
  });
});
