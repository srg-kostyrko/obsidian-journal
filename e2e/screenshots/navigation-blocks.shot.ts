import { $, browser } from "@wdio/globals";

import { VISIBLE_LEAF, hostNote, openInReadingMode } from "../journeys/code-blocks.js";
import { reloadObsidianOn } from "../support/clock.js";
import { activeNotePath, frontmatterOf, seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { captureThemed, recordOutcome, textsOf } from "./capture.js";

class UnexpectedNavSegmentCountError extends Error {
  constructor(segmentTexts: readonly string[]) {
    super(`expected at least 5 nav segments, got: ${JSON.stringify(segmentTexts)}`);
    this.name = "UnexpectedNavSegmentCountError";
  }
}

// Reading-mode nav block, rendered through the canonical `journal-nav` fence name (not the
// `calendar-nav` alias journeys/code-blocks.ts's own NAV_BLOCK/NAV_VIEW constants are scoped to).
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
const NAV_BLOCK = `${READING_VIEW} .block-language-journal-nav`;
const NAV_VIEW = `${NAV_BLOCK} .nav-view`;
const NAV_CURRENT = `${NAV_BLOCK} .nav-block-current`;

// The day navigation-blocks.md quotes.
const TODAY = "2026-09-14";

// Segments are `.nav-row` elements sharing one block; picking one by its rendered text is the
// only handle two segments in different lines offer. A real WebDriver click can't reach a row in
// this reading-mode layout (same Electron hit-test gap code-blocks.ts's clickNavNext documents),
// so dispatch a native DOM click, which still fires the Vue @click handler.
async function clickCurrentNavSegment(text: string): Promise<void> {
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

describe("navigation blocks examples", () => {
  before(async () => {
    await reloadObsidianOn(TODAY, { vault: "./e2e/fixtures/e2e-docs-navigation-blocks", plugins: ["journals"] });
  });

  it("opens the week's and month's notes from a daily note's default lines (#106)", async () => {
    const path = `day/${TODAY}.md`;
    await seedNote(path, hostNote("daily", TODAY, "```journal-nav\n```"));

    await openInReadingMode(path);
    await $(NAV_VIEW).waitForExist({ timeoutMsg: "journal-nav block did not render" });

    const segmentTexts = await textsOf(`${NAV_CURRENT} .nav-row`);
    // The day journal's default nav block: ddd, D (self), relative, week, month, year — one
    // segment per line. Week and month are lines 3 and 4 (0-indexed).
    const weekText = segmentTexts[3];
    const monthText = segmentTexts[4];
    if (weekText === undefined || monthText === undefined) {
      throw new UnexpectedNavSegmentCountError(segmentTexts);
    }

    await clickCurrentNavSegment(weekText);
    // The host note is still active when the click lands, so wait for the path to move off it.
    await waitForState(activeNotePath, (p) => p !== path, "waited for the week segment to open a note");
    const weekPath = (await activeNotePath()) ?? "";
    const weekFrontmatter = await frontmatterOf(weekPath);

    await openInReadingMode(path);
    await $(NAV_VIEW).waitForExist({ timeoutMsg: "journal-nav block did not re-render" });
    await clickCurrentNavSegment(monthText);
    await waitForState(
      activeNotePath,
      (active) => active !== path && active !== weekPath,
      "waited for the month segment to open a note",
    );
    const monthPath = (await activeNotePath()) ?? "";
    const monthFrontmatter = await frontmatterOf(monthPath);

    // Both clicks navigated away from the host note's own tab, which Obsidian then hides
    // (inline display:none) — re-open it so the visible-leaf screenshot is its nav block.
    await openInReadingMode(path);
    await $(NAV_VIEW).waitForExist({ timeoutMsg: "journal-nav block did not re-render for capture" });
    await captureThemed(NAV_VIEW, "navigation-blocks-lines");

    await recordOutcome("navigation-blocks-lines", {
      hostPath: path,
      segmentTexts,
      week: { label: weekText, openedPath: weekPath, frontmatter: weekFrontmatter },
      month: { label: monthText, openedPath: monthPath, frontmatter: monthFrontmatter },
    });
  });
});
