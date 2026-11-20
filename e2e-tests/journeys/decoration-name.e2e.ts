import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { waitForJournalFrontmatter } from "../support/vault.js";

import { dayAnchor, expectDecorated } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

// The fixture marks day 12 twice: an unnamed journal decoration and a vault-wide one named
// "Release day". Only the named one may reach the cell's accessible name — which is also the
// tooltip Obsidian shows — and the date must stay in front of it.
const NAMED_DAY = 12;

function longDate(day: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

describe("decoration name", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-decoration-name", plugins: ["journals"] });
  });

  it("adds a named decoration's name to the day cell's label", async () => {
    await openSeededCalendarView();
    const cell = calendar.cell(dayAnchor(NAMED_DAY));
    await expectDecorated(cell);

    const expected = m.decoration_cell_label({ date: longDate(NAMED_DAY), names: "Release day" });
    await browser.waitUntil(async () => (await cell.getAttribute("aria-label")) === expected, {
      timeoutMsg: `the day cell's label never became "${expected}"`,
    });

    // Opening the day's note marks the cell active, which re-renders it; the label must survive that.
    await cell.scrollIntoView({ block: "center", inline: "center" });
    await cell.click();
    await waitForJournalFrontmatter(`${dayAnchor(NAMED_DAY)}.md`, { journal: "daily", date: dayAnchor(NAMED_DAY) });
    await browser.waitUntil(async () => (await cell.getAttribute("data-active")) !== null, {
      timeoutMsg: "the named day's cell never became active",
    });
    expect(await cell.getAttribute("aria-label")).toBe(expected);
  });
});
