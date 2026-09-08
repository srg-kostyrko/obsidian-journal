import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";

import { dayAnchor } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

const DAY = 14;

// Five decorations put a shape in right_top on every weekday and the fixture pins the limit to
// 3, so every visible day cell overflows without seeding a note.
describe("decoration mark limit", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-mark-limit", plugins: ["journals"] });
  });

  it("draws the cap minus the badge, and the badge counts the rest", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    await expect(cell.$$(".place-right_top .shape-decoration")).toBeElementsArrayOfSize(2);

    const badge = cell.$('[data-testid="mark-overflow"]');
    await expect(badge).toHaveText(m.decoration_mark_overflow_badge({ count: 3 }));
  });

  it("reveals every mark in the slot when the badge is hovered", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    await cell.$('[data-testid="mark-overflow"]').moveTo();

    const popover = cell.$('[data-testid="mark-overflow-popover"]');
    await popover.waitForExist({ timeoutMsg: "the overflow popover did not open on hover" });
    await expect(popover.$$(".shape-decoration")).toBeElementsArrayOfSize(5);
  });
});
