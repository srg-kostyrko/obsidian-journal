import { $, browser, expect } from "@wdio/globals";

import { openPalette, paletteLists, promptChoose, waitForPrompt } from "../support/commands.js";
import { editorValue } from "../support/editor.js";
import { clickDialogButton, selectModalSelect, waitForDialogClosed } from "../support/settings.js";
import {
  closeAllLeaves,
  openNote,
  seedNote,
  waitForActiveNote,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

import { dayAnchor } from "./decorations.js";

// Slice B chunk 4 — the command-palette real-click seam. Each per-note command is check()-gated;
// the palette honors check() and only lists an available command, which executeCommandById (used
// by slices A/C/D) bypasses. None of this is reachable through __mocks__/obsidian.ts, which has no
// palette. Single boot; each it sets up its own active-leaf state, so order is irrelevant.

const INSERT = "Insert link to journal note";
const CONNECT = "Connect note to a journal";
const OPEN_NEXT = "Open next note";
const OPEN_PREV = "Open previous note";

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
      // Five journals are in scope, so the flow first opens the journal picker; pick the day journal.
      await waitForPrompt("Search journals");
      await promptChoose("daily");
      // Day picking shows the month view; click the in-month cell by its production data-anchor.
      const cell = $(`.modal-container [data-testid="month-cell"][data-anchor="${anchor}"]`);
      await cell.waitForClickable({ timeoutMsg: `date picker did not render the ${anchor} cell` });
      await cell.click();

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

  describe("connect note", () => {
    it("connects an unconnected note to a journal", async () => {
      await openNote("unconnected.md");
      await openPalette();
      await promptChoose(CONNECT);
      // ConnectNoteModal: the first <select> is the journal dropdown; the date defaults to today,
      // and rename/move default off, so the note stays in place and only gains frontmatter.
      await selectModalSelect("daily");
      await clickDialogButton("Connect");
      await waitForDialogClosed();

      // The date defaults to today's (run-time) anchor, so assert the journal tag and that the
      // date field was written, without pinning the unknown date value.
      await waitForFrontmatter(
        "unconnected.md",
        (fm) => fm.journal === "daily" && "journal-date" in fm,
        "connect-note did not attach journal=daily frontmatter",
      );
    });
  });

  describe("navigate adjacent entries", () => {
    it("opens the next adjacent journal entry", async () => {
      await openNote(NAV_MID);
      await openPalette();
      await promptChoose(OPEN_NEXT);
      await waitForActiveNote(NAV_NEXT);
    });

    it("opens the previous adjacent journal entry", async () => {
      await openNote(NAV_MID);
      await openPalette();
      await promptChoose(OPEN_PREV);
      await waitForActiveNote(NAV_PREV);
    });

    it("still lists navigation commands on a non-journal note", async () => {
      // v2-faithful: the commands are editor-gated (available whenever a note is active) and
      // surface a Notice when there's nothing to navigate to, rather than hiding themselves.
      // Verified across both commands, which share the same active-note guard.
      await openNote("plain-note.md");
      expect(await paletteLists(OPEN_NEXT)).toBe(true);
      expect(await paletteLists(OPEN_PREV)).toBe(true);
    });
  });
});
