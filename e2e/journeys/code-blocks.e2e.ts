import { $, browser, expect } from "@wdio/globals";

import { activeNotePath, seedNote, waitForJournalFrontmatter } from "../support/vault.js";

import {
  CODE_BLOCK_ERROR,
  HOME_BLOCK,
  HOME_FENCE,
  NAV_BLOCK,
  NAV_CURRENT,
  NAV_FENCE,
  NAV_NEXT,
  NAV_VIEW,
  TIMELINE_BAD_FENCE,
  TIMELINE_BLOCK,
  TIMELINE_FENCE,
  hostNote,
  openInReadingMode,
  plainNote,
  renderBlock,
} from "./code-blocks.js";
import { STYLE_HEX, expectTextHex } from "./decorations.js";

// Slice B chunk 2 — the code-block mount seam. Our Vue surfaces mount via
// VueCodeBlockHost (a reading-mode MarkdownRenderChild) instead of createApp on an
// ItemView. Code blocks only render in reading mode, which no __mocks__/obsidian.ts
// post-processor pipeline reproduces.

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

// A bare nav fence as a note body (monthly hosts carry no inline tags/tasks).
const NAV_FENCE_BODY = NAV_FENCE;

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
        await browser.execute((sel: string) => {
          const el = document.querySelector<HTMLElement>(sel);
          el?.click();
        }, NAV_NEXT);

        await waitForJournalFrontmatter("day/2026-06-15.md", { journal: "daily", date: "2026-06-15" });
        expect(await activeNotePath()).toBe("day/2026-06-15.md");
      });

      it("hides the next button on an existing-type nav when no neighbor note exists", async () => {
        await seedNote(monthPath(0), hostNote("monthly", monthAnchor(0), NAV_FENCE_BODY));
        await openInReadingMode(monthPath(0));
        await $(NAV_VIEW).waitForExist({ timeoutMsg: "monthly nav view did not render" });
        await expect($(NAV_NEXT)).not.toExist();
      });

      it("navigates to the adjacent existing note when an existing-type nav's next is clicked", async () => {
        await seedNote(monthPath(4), hostNote("monthly", monthAnchor(4), "neighbor"));
        await seedNote(monthPath(3), hostNote("monthly", monthAnchor(3), NAV_FENCE_BODY));
        await openInReadingMode(monthPath(3));
        await $(NAV_NEXT).waitForExist({
          timeoutMsg: "existing-type nav did not offer a next button with a neighbor seeded",
        });
        await browser.execute((sel: string) => {
          const el = document.querySelector<HTMLElement>(sel);
          el?.click();
        }, NAV_NEXT);

        await browser.waitUntil(async () => (await activeNotePath()) === monthPath(4), {
          timeoutMsg: `existing-type nav did not open the adjacent note ${monthPath(4)}`,
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

      it("renders the error fallback for a timeline fence with an invalid mode", async () => {
        await seedNote("blocks/bad-timeline.md", plainNote(TIMELINE_BAD_FENCE));
        await openInReadingMode("blocks/bad-timeline.md");
        await $(`${TIMELINE_BLOCK} ${CODE_BLOCK_ERROR}`).waitForExist({
          timeoutMsg: "schema-invalid timeline fence did not render the .code-block-error fallback",
        });
        await expect($(`${TIMELINE_BLOCK} .notes-month-view`)).not.toExist();
      });
    });
  });
});
