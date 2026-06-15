import { $, browser } from "@wdio/globals";

import { openNote, seedNote, waitForActiveNote, waitForJournalFrontmatter } from "../support/vault.js";

import { LIVE_LEAF } from "./view.js";

// The defined-navigation toolbar item mounts in a real Obsidian view leaf. Clicking its
// previous arrow takes the active note's entry anchor as reference and opens the nearest
// EXISTING earlier note of the target write type — skipping un-created days. That
// reference resolution + existing-only open seam only runs against a real leaf-mounted
// toolbar, never the obsidian mock.

const RIBBON_OPEN = '[aria-label="Open Defined Nav"]';
const MONTH_VIEW = `${LIVE_LEAF} .notes-month-view`;
const PREVIOUS_ARROW = `${LIVE_LEAF} .journal-view-toolbar [data-direction="previous"]`;

const EARLIER = "2030-10-10";
const LATER = "2030-10-12";

function dayNote(anchor: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\n---\n`;
}

// WebDriver's pointer click can't reach the flat toolbar icon button in this Electron
// harness (same limitation as code-blocks.ts clickNavNext). A native DOM click still
// fires the Vue @click handler, so the navigate() seam is genuinely driven.
async function clickPreviousArrow(): Promise<void> {
  await browser.execute((sel: string) => {
    document.querySelector<HTMLElement>(sel)?.click();
  }, PREVIOUS_ARROW);
}

describe("defined-navigation toolbar", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-defined-nav", plugins: ["journals"] });
    await seedNote(`day/${EARLIER}.md`, dayNote(EARLIER));
    await seedNote(`day/${LATER}.md`, dayNote(LATER));
    await waitForJournalFrontmatter(`day/${EARLIER}.md`, { journal: "daily", date: EARLIER });
    await waitForJournalFrontmatter(`day/${LATER}.md`, { journal: "daily", date: LATER });
  });

  it("opens the nearest earlier existing note when the previous arrow is clicked", async () => {
    await $(RIBBON_OPEN).click();
    await $(MONTH_VIEW).waitForExist({ timeoutMsg: "defined-nav view did not render after the ribbon click" });
    await $(PREVIOUS_ARROW).waitForExist({ timeoutMsg: "defined-navigation previous arrow did not render" });

    await openNote(`day/${LATER}.md`);
    await clickPreviousArrow();

    await waitForActiveNote(`day/${EARLIER}.md`);
  });
});
