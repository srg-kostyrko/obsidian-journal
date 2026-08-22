import { $, browser, expect } from "@wdio/globals";

import { activeNotePath, seedNote, waitForActiveNote, waitForJournalFrontmatter } from "../support/vault.js";

import {
  CODE_BLOCK_ERROR,
  HOME_BLOCK,
  HOME_FENCE,
  NAV_BLOCK,
  NAV_CURRENT,
  NAV_CURRENT_BLOCK,
  NAV_FENCE,
  NAV_NEXT,
  NAV_NEXT_BLOCK,
  NAV_PREVIOUS_BLOCK,
  NAV_VIEW,
  TIMELINE_BAD_FENCE,
  TIMELINE_BLOCK,
  TIMELINE_FENCE,
  TIMELINE_HIDDEN_WEEKDAYS_FENCE,
  TIMELINE_QUARTER_FENCE,
  clickNavNext,
  hostNote,
  livePreviewNote,
  monthGridLayout,
  narrowNavLayout,
  navViewFill,
  openInLivePreview,
  openInReadingMode,
  plainNote,
  renderBlock,
  timelineCalendar,
} from "./code-blocks.js";
import { STYLE_HEX, assertDecorationMatrix, expectTextHex, seedDecorationFixture } from "./decorations.js";

// Slice B chunk 2 — the code-block mount seam. Our Vue surfaces mount via
// VueCodeBlockHost (a reading-mode MarkdownRenderChild) instead of createApp on an
// ItemView. This suite drives them in reading mode, which no __mocks__/obsidian.ts
// post-processor pipeline reproduces; Live Preview mounts them too and is covered by
// timeline-navigation.e2e.ts.

// A daily host note carries a calendar-nav fence and connects via frontmatter so the
// nav renders its `.nav-view` (vs the not-connected fallback).
function navHost(anchor: string, body: string): string {
  return hostNote("daily", anchor, `${body}\n\n${NAV_FENCE}`);
}

// MonthPeriod.anchor === startOf("month") === YYYY-MM-01; new Date(y, m+offset, 1) rolls
// the year over, so a month host and its neighbor are computed without touching moment.
function monthAnchor(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// The monthly journal uses dateFormat "YYYY-MM", so its notes live at month/YYYY-MM.md,
// not month/YYYY-MM-01.md. Derive the vault path by slicing the YYYY-MM-01 anchor.
function monthPath(offset: number): string {
  return `month/${monthAnchor(offset).slice(0, 7)}.md`;
}

// Segments are still `.nav-row` elements within a line; picking one by its rendered text is
// the only handle a two-segment line offers, since both segments share the same block. Like
// clickNavNext, a real WebDriver click can't reach a nav row in this reading-mode layout (the
// Electron harness lacks the window/rect command scrollIntoView relies on) — dispatch a native
// DOM click instead, which still fires the Vue @click handler.
async function clickNavSegment(text: string): Promise<void> {
  const rowSelector = `${NAV_CURRENT} .nav-row`;
  await browser.waitUntil(
    async () =>
      browser.execute(
        (sel: string, target: string) =>
          [...document.querySelectorAll(sel)].some((el) => el.textContent?.trim() === target),
        rowSelector,
        text,
      ),
    { timeoutMsg: `nav segment "${text}" did not render` },
  );
  await browser.execute(
    (sel: string, target: string) => {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((row) => row.textContent?.trim() === target);
      el?.click();
    },
    rowSelector,
    text,
  );
}

describe("code blocks", () => {
  describe("navigation code block", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    });

    describe("rendering", () => {
      it("renders the nav view for a connected note and not the error fallback", async () => {
        await renderBlock("nav/render.md", navHost("2026-06-04", ""), NAV_VIEW);
        await expect($(`${NAV_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
      });

      it("renders the host period's date as visible text in the current nav block", async () => {
        await renderBlock("nav/render-text.md", navHost("2026-06-05", ""), NAV_VIEW);
        const row = $(NAV_CURRENT).$(".nav-row");
        await row.waitForExist({ timeoutMsg: "nav row did not render" });
        // wdio getText() uses innerText (visibility-aware); read textContent via execute
        // so the assertion is layout-independent and not gated on CSS rendering.
        const rowSelector = `${NAV_CURRENT} .nav-row`;
        await browser.waitUntil(
          async () => {
            const text = await browser.execute(
              (sel: string) => document.querySelector(sel)?.textContent ?? "",
              rowSelector,
            );
            return text.includes("2026-06-05");
          },
          { timeoutMsg: "nav row did not render the host date '2026-06-05'" },
        );
        const color = await row.getCSSProperty("color");
        // Transparent ink (the bug) has alpha 0; any visible theme color has alpha 1.
        // Don't assert a specific hex — theme vars resolve differently across the matrix.
        expect((color.parsed as { alpha?: number }).alpha).toBeGreaterThan(0);
      });
    });

    describe("styling hooks", () => {
      it("exposes distinct previous, current, and next block classes for CSS targeting", async () => {
        await renderBlock("nav/styling-hooks.md", navHost("2026-07-10", ""), NAV_VIEW);
        await $(NAV_PREVIOUS_BLOCK).waitForExist({ timeoutMsg: "nav-block-previous hook did not render" });
        await $(NAV_CURRENT_BLOCK).waitForExist({ timeoutMsg: "nav-block-current hook did not render" });
        await $(NAV_NEXT_BLOCK).waitForExist({ timeoutMsg: "nav-block-next hook did not render" });
      });
    });

    describe("responsive layout", () => {
      it("keeps the daily nav blocks on one row at a phone-pane width", async () => {
        await renderBlock("nav/narrow-daily.md", navHost("2026-09-09", ""), NAV_VIEW);
        const layout = await narrowNavLayout(360);
        // A day block's words are a fraction of a pane this wide; two up and one below is the
        // #271 report, not a stack.
        expect(layout.rows).toBe(1);
        expect(layout.overflowX).toBe(0);
      });

      it("keeps the weekly nav blocks on one row at a phone-pane width", async () => {
        await renderBlock("nav/narrow-weekly-row.md", hostNote("weekly", "2026-09-06", NAV_FENCE), NAV_VIEW);
        const layout = await narrowNavLayout(360);
        expect(layout.rows).toBe(1);
        expect(layout.overflowX).toBe(0);
      });

      it("fills the pane with the nav row in Live Preview, where the block mounts in an editor widget", async () => {
        await seedNote("nav/narrow-live.md", livePreviewNote("daily", "2026-09-10", NAV_FENCE));
        await openInLivePreview("nav/narrow-live.md");
        await $(NAV_VIEW).waitForExist({ timeoutMsg: "nav view did not render in Live Preview" });
        // The row is its own container query container, and that collapses to zero width under a
        // parent sized by its content — which is what this mount would be if any were.
        const { view, host } = await navViewFill();
        expect(view).toBeGreaterThanOrEqual(host - 1);
      });

      it("gives every weekly nav block its own row when the pane is too narrow for one row", async () => {
        // The note connects only when journal-date is the week's canonical anchor — the
        // week's first day (Sunday under the fixture's Sunday-start locale). Sun 2025-12-28
        // opens the week containing 2026-01-02; a non-anchor date is rejected as non-canonical.
        await renderBlock("nav/narrow-weekly.md", hostNote("weekly", "2025-12-28", NAV_FENCE), NAV_VIEW);
        const layout = await narrowNavLayout(180);
        // All three stack rather than two sharing a row and one dropping below it (#271) ...
        expect(layout.rows).toBe(3);
        // ... and nothing spills past the pane edge (the #216 "right-side cut off").
        expect(layout.overflowX).toBe(0);
      });

      it("stacks rather than leaving two blocks up and one below at a width that fits only two", async () => {
        // 300px holds a weekly block beside its neighbor but not all three, which is exactly the
        // width where flex wrapping alone drops a single column.
        await renderBlock("nav/two-fit.md", hostNote("weekly", "2026-09-06", NAV_FENCE), NAV_VIEW);
        const layout = await narrowNavLayout(300);
        expect(layout.rows).toBe(3);
        expect(layout.overflowX).toBe(0);
      });
    });

    describe("navigation", () => {
      it("offers the next period on a create-type nav even with no existing neighbor", async () => {
        await renderBlock("nav/create-present.md", navHost("2026-06-12", ""), NAV_VIEW);
        await $(NAV_NEXT).waitForExist({
          timeoutMsg: "create-type nav did not offer a next button with no neighbor seeded",
        });
      });

      it("creates and opens the next-day note when a create-type nav's next is clicked", async () => {
        await renderBlock("nav/create-click.md", navHost("2026-06-14", ""), NAV_VIEW);
        await clickNavNext();

        await waitForJournalFrontmatter("day/2026-06-15.md", { journal: "daily", date: "2026-06-15" });
        expect(await activeNotePath()).toBe("day/2026-06-15.md");
      });

      it("hides the next button on an existing-type nav when no neighbor note exists", async () => {
        await seedNote(monthPath(0), hostNote("monthly", monthAnchor(0), NAV_FENCE));
        await openInReadingMode(monthPath(0));
        await $(NAV_VIEW).waitForExist({ timeoutMsg: "monthly nav view did not render" });
        await expect($(NAV_NEXT)).not.toExist();
      });

      it("navigates to the adjacent existing note when an existing-type nav's next is clicked", async () => {
        await seedNote(monthPath(4), hostNote("monthly", monthAnchor(4), "neighbor"));
        await seedNote(monthPath(3), hostNote("monthly", monthAnchor(3), NAV_FENCE));
        await openInReadingMode(monthPath(3));
        await $(NAV_NEXT).waitForExist({
          timeoutMsg: "existing-type nav did not offer a next button with a neighbor seeded",
        });
        await clickNavNext();

        await browser.waitUntil(async () => (await activeNotePath()) === monthPath(4), {
          timeoutMsg: `existing-type nav did not open the adjacent note ${monthPath(4)}`,
        });
      });
    });

    describe("context menu", () => {
      it("opens a single context menu when a nav row is right-clicked", async () => {
        await renderBlock("nav/context-menu.md", navHost("2026-06-20", ""), NAV_VIEW);
        const row = `${NAV_CURRENT} .nav-row`;
        await $(row).waitForExist({ timeoutMsg: "nav row did not render" });

        // Right-click the current nav row. Without @contextmenu.prevent the plugin's own file
        // menu and Obsidian's reading-view context menu both open — issue #193's double menu.
        await browser.execute((sel: string) => {
          document
            .querySelector(sel)
            ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        }, row);

        await browser.waitUntil(
          async () => (await browser.execute(() => document.querySelectorAll(".menu").length)) >= 1,
          { timeoutMsg: "right-click did not open any context menu" },
        );
        const menuCount = await browser.execute(() => document.querySelectorAll(".menu").length);
        expect(menuCount).toBe(1);

        // Leave no open menu to bleed into the next test.
        await browser.execute(() => {
          for (const menu of document.querySelectorAll(".menu")) menu.remove();
        });
      });

      it("paints the appended Delete entry with Obsidian's destructive styling", async () => {
        await renderBlock("nav/context-menu.md", navHost("2026-06-20", ""), NAV_VIEW);
        const row = `${NAV_CURRENT} .nav-row`;
        await $(row).waitForExist({ timeoutMsg: "nav row did not render" });

        await browser.execute((sel: string) => {
          document
            .querySelector(sel)
            ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        }, row);

        // setWarning is only observable through the class Obsidian stamps on the rendered item.
        await browser.waitUntil(
          async () =>
            await browser.execute(() =>
              [...document.querySelectorAll(".menu-item")].some(
                (item) =>
                  item.classList.contains("is-warning") &&
                  item.querySelector(".menu-item-title")?.textContent === "Delete",
              ),
            ),
          { timeoutMsg: "the Delete menu item did not render with Obsidian's is-warning styling" },
        );

        await browser.execute(() => {
          for (const menu of document.querySelectorAll(".menu")) menu.remove();
        });
      });
    });

    describe("decorations", () => {
      it("decorates the current nav block when its note matches a corner condition", async () => {
        // The daily ctag→corner decoration matches the host's inline #ctag; decorateWholeBlock
        // wraps the current period's block. The host basename is "deco-corner" (not -07), so the
        // title condition can't also fire — only #ctag matches.
        await renderBlock("nav/deco-corner.md", navHost("2026-06-08", "#ctag"), NAV_VIEW);
        await $(NAV_CURRENT).$(".decoration-corner.top-left").waitForExist({
          timeoutMsg: "nav whole-block corner decoration did not render on the matching host",
        });
      });

      it("renders the nav decoration's text color through Obsidian's real CSS cascade", async () => {
        // cspell:disable
        // The daily scolor→color(#112233) decoration matches the host's inline #scolor.
        await renderBlock("nav/deco-color.md", navHost("2026-06-09", "#scolor"), NAV_VIEW);
        // cspell:enable
        await expectTextHex($(NAV_CURRENT), STYLE_HEX.color);
      });
    });

    describe("segment link dates", () => {
      // year-nav's current-block line carries two segments on the *same* line, each linked to
      // "quarter" — the plain Q1 segment (no linkDate) and a Q2 segment shifted +1q. The fixture
      // ships both Quarterly/2025-Q1.md and Quarterly/2025-Q2.md pre-existing (seedNote does not
      // survive the reboot in the top-level before hook), and Yearly/2025.md anchors at
      // 2025-01-01 so the two segments resolve to genuinely different notes (issue #169).
      it("opens the shifted quarter from a segment carrying a link date", async () => {
        await openInReadingMode("Yearly/2025.md");
        await clickNavSegment("Q2");
        await waitForActiveNote("Quarterly/2025-Q2.md");
      });

      it("opens the unshifted quarter from the sibling segment on the same line", async () => {
        await openInReadingMode("Yearly/2025.md");
        await clickNavSegment("Q1");
        await waitForActiveNote("Quarterly/2025-Q1.md");
      });
    });
  });

  describe("timeline and home code blocks", () => {
    before(async () => {
      await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    });

    describe("rendering", () => {
      it("renders the timeline month grid and not the error fallback", async () => {
        await renderBlock("blocks/timeline.md", plainNote(TIMELINE_FENCE), `${TIMELINE_BLOCK} .notes-month-view`);
        await expect($(`${TIMELINE_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
      });

      it("renders the journals-home block and not the error fallback", async () => {
        await renderBlock("blocks/home.md", plainNote(HOME_FENCE), `${HOME_BLOCK} .home-code-block`);
        await expect($(`${HOME_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
      });

      it("drops the hidden weekdays' columns from the timeline month grid", async () => {
        await renderBlock(
          "blocks/timeline-hidden-weekdays.md",
          plainNote(TIMELINE_HIDDEN_WEEKDAYS_FENCE),
          `${TIMELINE_BLOCK} .notes-month-view`,
        );
        // hiddenWeekdays [0, 6] removes two of the seven weekday columns. Scope the count to a
        // single grid — reading mode can mount the block's view in more than one render context.
        const grid = $(`${TIMELINE_BLOCK} .notes-month-view`);
        await expect(grid.$$(".notes-month-view__weekday")).toBeElementsArrayOfSize(5);
      });

      it("grays out adjacent-month day cells in the timeline month grid", async () => {
        await renderBlock("blocks/timeline.md", plainNote(TIMELINE_FENCE), `${TIMELINE_BLOCK} .notes-month-view`);
        // A lone month keeps its adjacent-month days for context, rendered inactive (grayed,
        // non-actionable) via the data-outside marker rather than blanked.
        const grid = $(`${TIMELINE_BLOCK} .notes-month-view`);
        await expect(grid.$$(".notes-month-view__day[data-outside]")).toBeElementsArrayOfSize({ gte: 1 });
        await expect(grid.$$(".notes-month-view__day--blank")).toBeElementsArrayOfSize(0);
      });

      it("blanks adjacent-month day cells in the timeline quarter grid", async () => {
        await renderBlock(
          "blocks/timeline-quarter.md",
          plainNote(TIMELINE_QUARTER_FENCE),
          `${TIMELINE_BLOCK} .notes-month-view`,
        );
        // Stacked months blank their adjacent-month days so a neighbor's own cells aren't
        // shadowed by duplicated dates: blank placeholders exist, no data-outside cell remains.
        const block = $(TIMELINE_BLOCK);
        await expect(block.$$(".notes-month-view__day--blank")).toBeElementsArrayOfSize({ gte: 1 });
        await expect(block.$$(".notes-month-view__day[data-outside]")).toBeElementsArrayOfSize(0);
      });

      it("falls back to the derived timeline when the fence mode is invalid", async () => {
        // A typo'd mode renders with the derived default instead of blanking the block into
        // an error panel: it parses as unset, and a non-journal host derives the week mode.
        await seedNote("blocks/bad-timeline.md", plainNote(TIMELINE_BAD_FENCE));
        await openInReadingMode("blocks/bad-timeline.md");
        await $(`${TIMELINE_BLOCK} .notes-week-view`).waitForExist({
          timeoutMsg: "invalid-mode timeline fence did not render the derived week timeline",
        });
        await expect($(`${TIMELINE_BLOCK} ${CODE_BLOCK_ERROR}`)).not.toExist();
      });
    });

    describe("decorations", () => {
      before(async () => {
        // Seed the 12 precondition notes (also opens the view leaf to read period anchors),
        // then render an unconnected month-mode timeline: null shelf ⇒ all journals in scope,
        // refDate ⇒ current month — the same grid (and the same 12 matches) as the view leaf.
        await seedDecorationFixture();
        await renderBlock(
          "blocks/timeline-matrix.md",
          plainNote(TIMELINE_FENCE),
          `${TIMELINE_BLOCK} .notes-month-view`,
        );
      });

      assertDecorationMatrix(timelineCalendar);

      // Its own suite, not a bare it(): mocha runs a suite's direct tests before its nested
      // suites, so a test registered alongside assertDecorationMatrix's describes would swap
      // the month timeline for a quarter one *before* the matrix reads it — and the matrix's
      // periodCell() takes the first data-testid match, which in a quarter is the first
      // month's header and week, not the seeded current one.
      describe("quarter month sizing", () => {
        it("keeps every month of a quarter timeline the same width", async () => {
          await renderBlock(
            "blocks/timeline-quarter-decorated.md",
            plainNote(TIMELINE_QUARTER_FENCE),
            `${TIMELINE_BLOCK} .notes-month-view`,
          );
          // The fixture's notes all sit in the current month, so a reservation taken from the
          // cells that matched gave that month wider cells than its two siblings, squeezed them
          // to their own content and pushed the last one out of the note.
          const layout = await monthGridLayout(`${TIMELINE_BLOCK} .timeline-quarter`, 1000);
          expect(new Set(layout.widths).size).toBe(1);
          expect(layout.overflowX).toBe(0);
        });
      });
    });
  });
});
