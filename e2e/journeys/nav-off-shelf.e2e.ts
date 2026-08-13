import { $, browser, expect } from "@wdio/globals";

import { activeNotePath, contentOf, waitForJournalFrontmatter, writeNote } from "../support/vault.js";

import {
  NAV_CURRENT,
  NAV_FENCE,
  NAV_NOT_CONNECTED,
  NAV_VIEW,
  hostNote,
  openInReadingMode,
  renderBlock,
} from "./code-blocks.js";

// A journal that belongs to no shelf must link its cross-type nav rows across *every* journal,
// not an empty set. The daily journal here sits on no shelf and its
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

    // The month-link row opens the off-shelf monthly journal at the month containing the host's
    // date — the note lands in the month folder and connects to the monthly journal. A dead link
    // (the regression) would create nothing. The stored date is the month's own anchor, not the
    // day clicked from: a monthly note dated mid-month is not a canonical anchor, so the index
    // rejects it (see the indexing test below).
    await waitForJournalFrontmatter(MONTH_NOTE, { journal: "monthly", date: "2026-06-01" });
    expect(await activeNotePath()).toBe(MONTH_NOTE);
  });

  it("indexes the monthly note created through the month-link row", async () => {
    await renderBlock(HOST, hostNote("daily", "2026-06-15", NAV_FENCE), NAV_VIEW);
    await $(NAV_ROW).waitForExist({ timeoutMsg: "off-shelf nav month-link row did not render" });

    await clickNavRow();
    await waitForJournalFrontmatter(MONTH_NOTE, { journal: "monthly", date: "2026-06-01" });

    // Frontmatter alone does not prove the note reached JournalsIndex — a note stored under a
    // non-canonical anchor keeps its frontmatter on disk and is silently dropped from the index.
    // The monthly journal has no template, so give the created note a nav fence of its own
    // (keeping the frontmatter the plugin wrote) and reopen it: the block renders its connected
    // view only when the index resolves the note's path to an entry.
    const created = await contentOf(MONTH_NOTE);
    await writeNote(MONTH_NOTE, `${created ?? ""}\n${NAV_FENCE}\n`);
    await openInReadingMode(MONTH_NOTE);

    await $(NAV_VIEW).waitForExist({ timeoutMsg: "the created monthly note never registered in the index" });
    await expect($(NAV_NOT_CONNECTED)).not.toExist();
  });
});
