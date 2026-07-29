import { $, browser, expect } from "@wdio/globals";

import { openPalette, paletteLists, promptChoose, waitForPrompt } from "../support/commands.js";
import { editorValue } from "../support/editor.js";
import {
  clickDialogButton,
  pickModalDate,
  selectModalSelect,
  toggleNamedModalToggle,
  waitForDialogClosed,
} from "../support/settings.js";
import {
  closeAllLeaves,
  frontmatterOf,
  openNote,
  seedNote,
  todayAnchor,
  waitForActiveNote,
  waitForJournalFrontmatter,
} from "../support/vault.js";

import { openInReadingMode } from "./code-blocks.js";
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

      // The link must carry the journal's folder: a bare [[<anchor>]] would create the note in the
      // vault's default location, where auto-attach can never match it to the journal.
      const link = `[[day/${anchor}|${anchor}]]`;
      await browser.waitUntil(
        async () => {
          const value = await editorValue();
          return value?.includes(link) ?? false;
        },
        { timeoutMsg: `editor never received the link ${link}` },
      );
    });

    it("is absent from the palette without an active editor", async () => {
      await closeAllLeaves();
      expect(await paletteLists(INSERT)).toBe(false);
    });
  });

  describe("connect note", () => {
    it("connects an unconnected note to a journal", async () => {
      const anchor = todayAnchor();
      await openNote("unconnected.md");
      await openPalette();
      await promptChoose(CONNECT);
      // ConnectNoteModal: the first <select> is the journal dropdown; the date starts empty and
      // Connect stays disabled until one is picked. Rename/move default off, so the note stays
      // in place and only gains frontmatter.
      await selectModalSelect("daily");
      await pickModalDate(anchor);
      await clickDialogButton("Connect");
      await waitForDialogClosed();

      await waitForJournalFrontmatter("unconnected.md", { journal: "daily", date: anchor });
    });

    it("moves and renames the note into the journal when both options are enabled", async () => {
      // Any current-month day other than today: today's cell is occupied by the previous test's
      // connection, which would raise an override toggle this test is not about. Staying in the
      // current month keeps the pick to one click on the view the picker opens with.
      const anchor = dayAnchor(new Date().getDate() === 1 ? 2 : 1);
      await seedNote("inbox/loose-note.md", "move me\n");
      await openNote("inbox/loose-note.md");
      await openPalette();
      await promptChoose(CONNECT);
      await selectModalSelect("daily");
      // Picking the date resets the rename/move toggles, so it has to come before they are set.
      await pickModalDate(anchor);
      await toggleNamedModalToggle("Rename file to match the journal");
      await toggleNamedModalToggle("Move file into the journal's folder");
      await clickDialogButton("Connect");
      await waitForDialogClosed();

      // The destination is day/<anchor>.md; the original path is gone.
      await waitForJournalFrontmatter(`day/${anchor}.md`, { journal: "daily", date: anchor });
      expect(await frontmatterOf("inbox/loose-note.md")).toBeNull();
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

    it("lists navigation commands while a journal note is open in reading mode", async () => {
      // Gated on the active note being connected to a journal, not on an active editor, so a
      // connected note surfaces the commands in reading (preview) mode too.
      await openInReadingMode(NAV_MID);
      expect(await paletteLists(OPEN_NEXT)).toBe(true);
    });

    it("hides navigation commands on a non-journal note", async () => {
      // Navigating adjacent entries is meaningless on a note that belongs to no journal, so the
      // commands hide rather than surface a no-op notice. Verified across both commands.
      await openNote("plain-note.md");
      expect(await paletteLists(OPEN_NEXT)).toBe(false);
      expect(await paletteLists(OPEN_PREV)).toBe(false);
    });
  });
});
