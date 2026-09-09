import { browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";

import { dayAnchor, elementWidthPx } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

const DAY = 14;

// The fixture pins the limit to 3 and decorates every weekday twice over, so every visible day
// cell overflows without seeding a note: five small shapes in right_top, and twelve more in
// left_bottom, whose badge sits against the cell's left edge and opens a popover wide enough to
// reach past the surface. The two groups take different rows of the cell so neither slot's marks
// overhang the other's badge, which would send a hover to the wrong one.
describe("decoration mark limit", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-mark-limit", plugins: ["journals"] });
  });

  it("draws the cap minus the badge, and the badge counts the rest", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    await expect(cell.$$(".place-right_top .shape-decoration")).toBeElementsArrayOfSize(2);

    const badge = cell.$('.place-right_top [data-testid="mark-overflow"]');
    await expect(badge).toHaveText(m.decoration_mark_overflow_badge({ count: 3 }));
  });

  it("lines the badge up with the marks it follows", async () => {
    await openSeededCalendarView();

    const centers = await browser.execute((anchor: string) => {
      const selector = `.notes-month-view__day[data-anchor="${CSS.escape(anchor)}"] .place-right_top`;
      const slot = document.querySelector(selector);
      const mark = slot?.querySelector(":scope > .shape-decoration")?.getBoundingClientRect();
      const badge = slot?.querySelector('[data-testid="mark-overflow"]')?.getBoundingClientRect();
      return mark == null || badge == null
        ? null
        : { mark: mark.top + mark.height / 2, badge: badge.top + badge.height / 2 };
    }, dayAnchor(DAY));

    expect(centers).not.toBeNull();
    expect(Math.abs((centers?.mark ?? 0) - (centers?.badge ?? 0))).toBeLessThanOrEqual(1);
  });

  it("reveals the marks the badge hides when it is hovered", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    await cell.$('.place-right_top [data-testid="mark-overflow"]').moveTo();

    const popover = cell.$('.place-right_top [data-testid="mark-overflow-popover"]');
    await popover.waitForExist({ timeoutMsg: "the overflow popover did not open on hover" });
    await expect(popover.$$(".shape-decoration")).toBeElementsArrayOfSize(3);

    // The popover must render marks larger, at a readable size — assert the ratio, never an
    // absolute pixel width, since Obsidian's editor zoom scales authored pixels (elementWidthPx's
    // own comment covers why). The cell reading is scoped to a direct child of .place-right_top:
    // the popover's own marks also live under that place span (nested inside .mark-overflow), so
    // a descendant selector would match the popover copy first and compare it against itself.
    const popoverMarkWidth = await elementWidthPx(popover.$(".shape-decoration"));
    const cellMarkWidth = await elementWidthPx(cell.$(".place-right_top > .shape-decoration"));
    expect(popoverMarkWidth).toBeGreaterThanOrEqual(cellMarkWidth * 2);
  });

  it("keeps the popover open as the pointer moves from the badge into it", async () => {
    await openSeededCalendarView();

    const cell = calendar.cell(dayAnchor(DAY));
    const badge = cell.$('.place-right_top [data-testid="mark-overflow"]');
    await badge.waitForExist();

    const location = await badge.getLocation();
    const size = await badge.getSize();
    const badgeCenterX = Math.round(location.x + size.width / 2);
    const badgeCenterY = Math.round(location.y + size.height / 2);
    // One pixel past the badge's own border box. With the popover flush against the badge
    // (Fix 1) this point lands inside the popover; with any gap it lands in the calendar cell
    // behind, which is not a descendant of the badge and fires its mouseleave.
    const justBelowBadge = Math.round(location.y + size.height) + 1;

    await browser
      .action("pointer")
      .move({ duration: 0, x: badgeCenterX, y: badgeCenterY })
      .pause(50)
      .move({ duration: 0, x: badgeCenterX, y: justBelowBadge })
      .perform();

    const popover = cell.$('.place-right_top [data-testid="mark-overflow-popover"]');
    await expect(popover).toExist();
  });

  // A popover hangs off its badge's right edge, so the left_bottom badge of a first-column cell
  // opens one that reaches past the surface it draws over — the seeded view's right sidebar here.
  it("keeps the popover inside the surface it opens over", async () => {
    await openSeededCalendarView();

    const anchor = await browser.execute(() => {
      let leftmost: Element | null = null;
      for (const badge of document.querySelectorAll('.place-left_bottom [data-testid="mark-overflow"]')) {
        const closer = leftmost === null || badge.getBoundingClientRect().left < leftmost.getBoundingClientRect().left;
        if (closer) leftmost = badge;
      }
      const cell = leftmost?.closest("[data-anchor]");
      return cell instanceof HTMLElement ? (cell.dataset.anchor ?? null) : null;
    });
    expect(anchor).not.toBeNull();

    const cell = calendar.cell(anchor ?? "");
    await cell.$('.place-left_bottom [data-testid="mark-overflow"]').moveTo();
    await cell
      .$('.place-left_bottom [data-testid="mark-overflow-popover"]')
      .waitForExist({ timeoutMsg: "the overflow popover did not open on hover" });

    const edges = await browser.execute(() => {
      const popover = document.querySelector('.place-left_bottom [data-testid="mark-overflow-popover"]');
      const leaf = popover?.closest(".workspace-leaf-content");
      return popover == null || leaf == null
        ? null
        : { popover: popover.getBoundingClientRect().left, leaf: leaf.getBoundingClientRect().left };
    });

    expect(edges).not.toBeNull();
    expect(edges?.popover).toBeGreaterThanOrEqual(edges?.leaf ?? 0);
  });
});
