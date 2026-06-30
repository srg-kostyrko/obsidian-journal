import { $, browser, expect } from "@wdio/globals";

import { activeNotePath, waitForJournalFrontmatter } from "../support/vault.js";

import { NAV_CURRENT, NAV_FENCE, NAV_VIEW, hostNote, renderBlock } from "./code-blocks.js";

// A journal that belongs to no shelf must link its cross-type nav rows across *every* journal,
// not an empty set (v2's all-journals fallback). The daily journal here sits on no shelf and its
// nav block carries a single month-link row; clicking it has to reach the off-shelf monthly
// journal. Before the fix the off-shelf candidate set was empty, so the row resolved to a dead
// link and the click created nothing.

const HOST = "day/2026-06-15.md";
const MONTH_NOTE = "month/2026-06.md";
const NAV_ROW = `${NAV_CURRENT} .nav-row`;

// The nav row is a plain @click div; a native DOM click fires the Vue handler without relying on
// WebDriver's pointer hit-test (same harness limitation clickNavNext documents).
async function clickNavRow(): Promise<void> {
  await browser.execute((sel: string) => {
    document.querySelector<HTMLElement>(sel)?.click();
  }, NAV_ROW);
}

describe("off-shelf nav block cross-type link", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-off-shelf-nav", plugins: ["journals"] });
  });

  it("opens the monthly note when an off-shelf daily journal's month-link row is clicked", async () => {
    await renderBlock(HOST, hostNote("daily", "2026-06-15", NAV_FENCE), NAV_VIEW);
    await $(NAV_ROW).waitForExist({ timeoutMsg: "off-shelf nav month-link row did not render" });

    await clickNavRow();

    // The month-link row opens the off-shelf monthly journal at the host's date — the note lands
    // in the month folder and connects to the monthly journal. A dead link (the regression) would
    // create nothing.
    await waitForJournalFrontmatter(MONTH_NOTE, { journal: "monthly", date: "2026-06-15" });
    expect(await activeNotePath()).toBe(MONTH_NOTE);
  });
});
