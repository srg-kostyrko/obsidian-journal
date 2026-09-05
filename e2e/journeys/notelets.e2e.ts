import { $, $$, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { runCommand } from "../support/commands.js";
import {
  activeNotePath,
  closeAllLeaves,
  frontmatterOf,
  noteExists,
  seedNote,
  todayAnchor,
  waitForActiveNote,
  waitForActiveNoteIn,
} from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { openInReadingMode } from "./code-blocks.js";

// Notelets are the one journal surface with no e2e coverage at all, and three of their seams are
// reachable only against a real vault: NoteletPathService picks the next free path by asking the
// vault what already exists, the counter is assigned from what JournalsIndex parsed back out of
// metadataCache, and the listing fence reads the host note's own entry. The falsifier that unit
// tests cannot state at all is the negative one — creating a notelet must not create (or touch)
// the journal's period note for the same day.

// Obsidian keeps BOTH a markdown-source-view (live preview) and a markdown-reading-view mounted in
// the same leaf, and each renders the fence — so a block scoped to the leaf matches the same note's
// block twice and every count doubles. Scope to the reading view, which is the one openInReadingMode
// puts on screen.
const NOTELET_BLOCK = ".markdown-reading-view .block-language-journal-notelets";
const LIST_ROW = `${NOTELET_BLOCK} .journal-notelet-list__row`;
const TYPE_HEADING = `${NOTELET_BLOCK} .journal-notelet-list__type-heading`;
const NOT_CONNECTED = `${NOTELET_BLOCK} .journal-notelets-not-connected`;

// A fixed past day, so the listing tests are independent of the notelets the creation tests
// accumulate for today on this shared boot.
const LISTED_DAY = "2030-03-05";

function noteletNote(anchor: string, type: string, extra = ""): string {
  return `---\njournal: daily\njournal-date: ${anchor}\njournal-notelet: ${type}\n${extra}---\n`;
}

function fenceNote(anchor: string, fence: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\n---\n${fence}\n`;
}

async function seedListedDay(fence: string): Promise<void> {
  // openInReadingMode opens a fresh tab every call, and an inactive tab's leaf stays in the DOM.
  // Only one block may be on screen for the row counts below to mean what they say.
  await closeAllLeaves();
  await seedNote(
    `day/meetings/${LISTED_DAY} Meeting 1.md`,
    noteletNote(LISTED_DAY, "Meeting", "journal-notelet-index: 1\n"),
  );
  await seedNote(`day/retros/${LISTED_DAY} Retro.md`, noteletNote(LISTED_DAY, "Retro"));
  await seedNote(`day/${LISTED_DAY}.md`, fenceNote(LISTED_DAY, fence));
  await openInReadingMode(`day/${LISTED_DAY}.md`);
  await $(NOTELET_BLOCK).waitForExist({ timeoutMsg: "the journal-notelets block did not render" });
}

describe("notelets", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  describe("creating", () => {
    const today = todayAnchor();

    it("writes the notelet under its type's own folder without creating the day's period note", async () => {
      await runCommand("journals:create-meeting");

      const path = await waitForActiveNoteIn("day/meetings");
      expect(path).toBe(`day/meetings/${today} Meeting 1.md`);
      const frontmatter = await frontmatterOf(path);
      expect(frontmatter?.journal).toBe("daily");
      expect(frontmatter?.["journal-date"]).toBe(today);
      expect(frontmatter?.["journal-notelet"]).toBe("Meeting");
      expect(frontmatter?.["journal-notelet-index"]).toBe(1);

      // The whole point of a notelet: it sits beside the period note rather than standing in for
      // it. A create path that fell back to NoteCreationService would leave this note behind.
      expect(await noteExists(`day/${today}.md`)).toBe(false);
    });

    it("numbers the next notelet of the same type within the same period", async () => {
      await runCommand("journals:create-meeting");

      await waitForActiveNote(`day/meetings/${today} Meeting 2.md`);
      const frontmatter = await frontmatterOf(`day/meetings/${today} Meeting 2.md`);
      expect(frontmatter?.["journal-notelet-index"]).toBe(2);
      // The first one is still there under its own number — the second did not overwrite it.
      expect(await noteExists(`day/meetings/${today} Meeting 1.md`)).toBe(true);
    });

    // Retro's name template carries nothing that varies within a day and its counter is off, so
    // both notelets render the same name. availablePathFor has to suffix rather than collide.
    it("suffixes a second notelet whose name template cannot vary within the period", async () => {
      await runCommand("journals:create-retro");
      await waitForActiveNote(`day/retros/${today} Retro.md`);

      await runCommand("journals:create-retro");

      // waitForActiveNoteIn is satisfied by the note the *first* create left active, so the
      // second one has to be waited for by difference, not by folder.
      let second = "";
      await waitForState(
        activeNotePath,
        (active) => {
          second = active;
          return active.startsWith("day/retros/") && active !== `day/retros/${today} Retro.md`;
        },
        "the second Retro notelet never became the active note",
      );
      expect(await noteExists(`day/retros/${today} Retro.md`)).toBe(true);
      const frontmatter = await frontmatterOf(second);
      expect(frontmatter?.["journal-notelet"]).toBe("Retro");
      expect(frontmatter?.["journal-date"]).toBe(today);
    });
  });

  describe("listing", () => {
    it("lists the host period's notelets grouped by type", async () => {
      await seedListedDay("```journal-notelets\n```");

      await expect($$(LIST_ROW)).toBeElementsArrayOfSize(2);
      const headings = await $$(TYPE_HEADING).map((heading) => heading.getText());
      expect(headings).toEqual(["Meeting", "Retro"]);
    });

    it("opens the notelet a row names", async () => {
      await seedListedDay("```journal-notelets\n```");

      const labels = await $$(LIST_ROW).map((row) => row.getText());
      const index = labels.findIndex((label) => label.includes("Meeting"));
      expect(index).toBeGreaterThanOrEqual(0);
      const rows = await $$(LIST_ROW).getElements();
      await rows.at(index)?.click();

      await waitForActiveNote(`day/meetings/${LISTED_DAY} Meeting 1.md`);
    });

    it("narrows the list to the types the fence names", async () => {
      await seedListedDay("```journal-notelets\ntypes:\n  - Retro\n```");

      await expect($$(LIST_ROW)).toBeElementsArrayOfSize(1);
      await expect($(LIST_ROW)).toHaveText(`${LISTED_DAY} Retro`);
    });

    it("says so in a note connected to no journal", async () => {
      await closeAllLeaves();
      await seedNote("loose-notelets.md", "```journal-notelets\n```\n");
      await openInReadingMode("loose-notelets.md");

      await $(NOT_CONNECTED).waitForExist({ timeoutMsg: "the unconnected fallback did not render" });
      await expect($(NOT_CONNECTED)).toHaveText(m.code_blocks_notelets_not_connected());
      await expect($(LIST_ROW)).not.toExist();
    });

    // A notelet is an indexed entry in its own right, so the fence in one resolves the same
    // period as the fence in the day note — and lists the host itself.
    it("lists the period's notelets from inside one of them", async () => {
      await seedListedDay("```journal-notelets\n```");
      await closeAllLeaves();
      await seedNote(
        `day/retros/${LISTED_DAY} Retro.md`,
        `${noteletNote(LISTED_DAY, "Retro")}\`\`\`journal-notelets\n\`\`\`\n`,
      );
      await openInReadingMode(`day/retros/${LISTED_DAY} Retro.md`);
      await $(NOTELET_BLOCK).waitForExist({ timeoutMsg: "the fence inside a notelet did not render" });

      await expect($$(LIST_ROW)).toBeElementsArrayOfSize(2);
      expect(await activeNotePath()).toBe(`day/retros/${LISTED_DAY} Retro.md`);
    });
  });
});
