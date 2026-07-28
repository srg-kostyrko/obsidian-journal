import { browser, expect } from "@wdio/globals";

import { openPalette, paletteLists, promptChoose, runCommand } from "../support/commands.js";
import { waitForNotice } from "../support/notices.js";
import {
  openNote,
  seedNote,
  waitForActiveNote,
  waitForActiveNoteIn,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

// The user-configured command seam: DynamicCommandRegistry registers each stored command with
// Obsidian and dispatches OpenDateFlow on execute. The settings spec only proves the command's
// config persists; here we run it through the real palette so target resolution, the today/
// open-note reference, the same/next anchor step, and the check() availability gate are all
// exercised end to end — none of which executeCommandById or the mocked flow reach. Single boot;
// each it sets up its own active-leaf state, so order is irrelevant.
const JUMP_TODAY = "Jump to today";
const JUMP_NEXT = "Jump to the following day";
const ADVANCE_FROM_ENTRY = "Advance from the open entry only";

// Far-future, fixed dates on the unbounded daily timeline — clear of today's anchor (which
// "Jump to today" creates) so the next-day neighbor never collides with it.
const OPEN_ENTRY = "day/2031-05-10.md";
const NEXT_ENTRY = "day/2031-05-11.md";

function dailyNote(anchor: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\n---\n`;
}

describe("dynamic commands", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-commands", plugins: ["journals"] });
  });

  describe("running a command", () => {
    it("creates and opens today's entry for an all-journals command", async () => {
      await openPalette();
      await promptChoose(JUMP_TODAY);

      // The date is "today" at run time, so we assert the journal folder and tag rather than a
      // pinned path: the command resolved the sole day journal and opened its entry.
      const path = await waitForActiveNoteIn("day");
      await waitForFrontmatter(
        path,
        (frontmatter) => frontmatter.journal === "daily",
        `${path} did not attach journal=daily frontmatter`,
      );
    });

    it("opens the next period relative to the active entry", async () => {
      await seedNote(OPEN_ENTRY, dailyNote("2031-05-10"));
      await waitForJournalFrontmatter(OPEN_ENTRY, { journal: "daily", date: "2031-05-10" });
      await openNote(OPEN_ENTRY);

      await openPalette();
      await promptChoose(JUMP_NEXT);

      await waitForActiveNote(NEXT_ENTRY);
    });
  });

  describe("availability", () => {
    it("hides an only-open-note command when no journal entry is active", async () => {
      // only_open_note plans nothing unless the active note is one of the command's journals, so
      // check() returns false and the palette omits it — the real gate executeCommandById bypasses.
      await seedNote("plain.md", "not a journal note\n");
      await openNote("plain.md");
      expect(await paletteLists(ADVANCE_FROM_ENTRY)).toBe(false);
    });

    it("notices when an unlisted command is invoked outside the palette", async () => {
      // executeCommandById is the path a bound hotkey and a ribbon icon take: neither consults
      // the listing gate, so Obsidian reaches checkCallback(false) directly. Proves the invoke
      // still runs and explains itself instead of swallowing the press.
      await seedNote("plain.md", "not a journal note\n");
      await openNote("plain.md");

      await runCommand("journals:advance-from-entry");

      await waitForNotice("Open a note this command applies to first.");
    });
  });
});
