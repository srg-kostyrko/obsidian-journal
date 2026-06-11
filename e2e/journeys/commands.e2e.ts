import { $, browser, expect } from "@wdio/globals";

import { openPalette, paletteLists, promptChoose, waitForPrompt } from "../support/commands.js";
import { editorValue } from "../support/editor.js";
import { closeAllLeaves, openNote, seedNote, waitForJournalFrontmatter } from "../support/vault.js";

import { dayAnchor } from "./decorations.js";

// Slice B chunk 4 — the command-palette real-click seam. Each per-note command is check()-gated;
// the palette honors check() and only lists an available command, which executeCommandById (used
// by slices A/C/D) bypasses. None of this is reachable through __mocks__/obsidian.ts, which has no
// palette. Single boot; each it sets up its own active-leaf state, so order is irrelevant.

const INSERT = "Insert link to journal note";

// Far-future, fixed dates (the daily timeline is unbounded) — well clear of today's anchor
// (which connect-note attaches) so their next/prev neighbors never shift.
const NAV_PREV = "day/2030-03-10.md";
const NAV_MID = "day/2030-03-11.md";
const NAV_NEXT = "day/2030-03-12.md";

function dailyNote(anchor: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\n---\n`;
}

describe("commands", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    await seedNote("editor-note.md", "editor body\n");
    await seedNote("plain-note.md", "not a journal note\n");
    await seedNote("unconnected.md", "connect me\n");
    await seedNote(NAV_PREV, dailyNote("2030-03-10"));
    await seedNote(NAV_MID, dailyNote("2030-03-11"));
    await seedNote(NAV_NEXT, dailyNote("2030-03-12"));
    // The JournalsIndex registers entries off metadataCache; waiting on the parsed frontmatter
    // confirms the three adjacent notes are indexed before open-next/prev can resolve.
    await waitForJournalFrontmatter(NAV_PREV, { journal: "daily", date: "2030-03-10" });
    await waitForJournalFrontmatter(NAV_MID, { journal: "daily", date: "2030-03-11" });
    await waitForJournalFrontmatter(NAV_NEXT, { journal: "daily", date: "2030-03-12" });
  });

  describe("insert date link", () => {
    it("inserts a journal date link at the editor cursor", async () => {
      const anchor = dayAnchor(15);
      await openNote("editor-note.md");
      await openPalette();
      await promptChoose(INSERT);
      // 5 journals → the journal picker suggest opens first; pick the day journal.
      await waitForPrompt("Search journals");
      await promptChoose("daily");
      // Day picking shows the month view; click the in-month cell by its production data-anchor.
      await $(`.modal-container [data-testid="month-cell"][data-anchor="${anchor}"]`).click();

      await browser.waitUntil(
        async () => {
          const value = await editorValue();
          return value?.includes(anchor) ?? false;
        },
        { timeoutMsg: `editor never received a link containing ${anchor}` },
      );
    });

    it("is absent from the palette without an active editor", async () => {
      await closeAllLeaves();
      expect(await paletteLists(INSERT)).toBe(false);
    });
  });
});
