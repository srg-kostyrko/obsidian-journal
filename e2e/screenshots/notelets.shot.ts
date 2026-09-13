import { $, browser } from "@wdio/globals";

import { hostNote, openInReadingMode, VISIBLE_LEAF } from "../journeys/code-blocks.js";
import { runCommand } from "../support/commands.js";
import { setModalText, submitModal, waitForModalOpen } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import {
  closeAllLeaves,
  frontmatterOf,
  seedNote,
  todayAnchor,
  waitForActiveNoteIn,
  waitForDistinctActiveNote,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

import { captureThemed, recordOutcome, textsOf } from "./capture.js";

// Same reading-view scoping as code-blocks.shot.ts: a markdown leaf keeps both a live-preview
// and a reading-view copy of a fence mounted, so an unscoped selector would match twice.
const READING_VIEW = `${VISIBLE_LEAF} .markdown-reading-view`;
const NOTELET_BLOCK = `${READING_VIEW} .block-language-journal-notelets`;
const LIST_ROW = `${NOTELET_BLOCK} .journal-notelet-list__row`;
const TYPE_HEADING = `${NOTELET_BLOCK} .journal-notelet-list__type-heading`;

// A non-settings modal's own title element (Obsidian's Modal.setTitle), scoped past the
// settings panel the same way settings.ts's activeModal() is, for the one thing modalText()
// (the dialog's whole rendered text) cannot isolate on its own.
const DIALOG_TITLE = ".modal-container:not(:has(.mod-settings)) .modal-title";

function noteletNote(anchor: string, type: string, extra = ""): string {
  return `---\njournal: daily\njournal-date: ${anchor}\njournal-notelet: ${type}\n${extra}---\n`;
}

describe("notelets examples", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
  });

  it("numbers a Meeting notelet created twice for today", async () => {
    const today = todayAnchor();

    await runCommand("journals:create-meeting");
    const first = await waitForActiveNoteIn("day/meetings");
    await waitForFrontmatter(
      first,
      (frontmatter) => frontmatter["journal-notelet-index"] === 1,
      "waited for the first Meeting notelet's counter to reach metadataCache",
    );
    const firstFrontmatter = await frontmatterOf(first);

    await runCommand("journals:create-meeting");
    // waitForActiveNoteIn would be satisfied instantly by the note the FIRST create already
    // left active (same folder), so the second create has to be waited for by difference.
    const second = await waitForDistinctActiveNote(first, {
      folder: "day/meetings",
      timeoutMsg: "waited for the second Meeting notelet to become active",
    });
    await waitForFrontmatter(
      second,
      (frontmatter) => frontmatter["journal-notelet-index"] === 2,
      "waited for the second Meeting notelet's counter to reach metadataCache",
    );
    const secondFrontmatter = await frontmatterOf(second);

    await recordOutcome("notelets-meeting", {
      today,
      first: { path: first, index: firstFrontmatter?.["journal-notelet-index"] },
      second: { path: second, index: secondFrontmatter?.["journal-notelet-index"] },
    });
  });

  it("suffixes a second Retro notelet whose name does not vary within the day", async () => {
    const today = todayAnchor();

    await runCommand("journals:create-retro");
    const first = await waitForActiveNoteIn("day/retros");
    await waitForFrontmatter(
      first,
      (frontmatter) => frontmatter["journal-notelet"] === "Retro",
      "waited for the first Retro notelet to reach metadataCache",
    );

    await runCommand("journals:create-retro");
    const second = await waitForDistinctActiveNote(first, {
      folder: "day/retros",
      timeoutMsg: "waited for the second Retro notelet to become active",
    });
    await waitForFrontmatter(
      second,
      (frontmatter) => frontmatter["journal-notelet"] === "Retro",
      "waited for the second Retro notelet to reach metadataCache",
    );

    await recordOutcome("notelets-retro", {
      today,
      first,
      second,
      suffixed: second !== first,
    });
  });

  it("lists today's notelets grouped by type in a journal-notelets fence", async () => {
    const today = todayAnchor();
    const path = `day/${today}.md`;

    await seedNote(`day/meetings/${today} Meeting 1.md`, noteletNote(today, "Meeting", "journal-notelet-index: 1\n"));
    await seedNote(`day/meetings/${today} Meeting 2.md`, noteletNote(today, "Meeting", "journal-notelet-index: 2\n"));
    await seedNote(`day/retros/${today} Retro.md`, noteletNote(today, "Retro"));
    await seedNote(`day/retros/${today} Retro 1.md`, noteletNote(today, "Retro"));
    await seedNote(path, hostNote("daily", today, "```journal-notelets\n```"));
    await openInReadingMode(path);
    await $(NOTELET_BLOCK).waitForExist({ timeoutMsg: "the journal-notelets block did not render" });
    await $(LIST_ROW).waitForExist({ timeoutMsg: "the journal-notelets block listed no rows" });

    await captureThemed(NOTELET_BLOCK, "notelets-block");

    await recordOutcome("notelets-block", {
      today,
      headings: await textsOf(TYPE_HEADING),
      rows: await textsOf(LIST_ROW),
    });
  });

  it("creates a Meeting notelet through an obsidian://journals notelet link", async () => {
    // Reload so this test records Meeting 3 regardless of what earlier tests in this describe
    // block left behind — it seeds its own two prior Meeting notelets.
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
    const today = todayAnchor();
    await seedNote(`day/meetings/${today} Meeting 1.md`, noteletNote(today, "Meeting", "journal-notelet-index: 1\n"));
    await seedNote(`day/meetings/${today} Meeting 2.md`, noteletNote(today, "Meeting", "journal-notelet-index: 2\n"));

    await closeAllLeaves();
    await openViaUri({ journal: "daily", notelet: "Meeting" });

    const path = await waitForActiveNoteIn("day/meetings");
    await waitForFrontmatter(
      path,
      (frontmatter) => frontmatter["journal-notelet"] === "Meeting" && frontmatter["journal-notelet-index"] === 3,
      "waited for the link-created Meeting notelet's counter to reach metadataCache",
    );
    const frontmatter = await frontmatterOf(path);

    await recordOutcome("notelets-link", { path, frontmatter });
  });
});

describe("questions examples", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-prompts", plugins: ["journals"] });
  });

  it("answers a sprint's goal question and writes it to a property", async () => {
    const anchor = "2030-07-01";
    const path = "sprint 1.md";

    await openViaUri({ journal: "sprint", date: anchor });
    await waitForModalOpen();
    const title = await $(DIALOG_TITLE).getText();

    await setModalText("Clear the backlog");
    await submitModal();

    await waitForJournalFrontmatter(path, { journal: "sprint", date: anchor });
    await waitForFrontmatter(
      path,
      (frontmatter) => frontmatter.goal === "Clear the backlog",
      "waited for the goal answer to reach the note's frontmatter",
    );
    const frontmatter = await frontmatterOf(path);

    await recordOutcome("questions-sprint-goal", { anchor, title, path, frontmatter });
  });
});
