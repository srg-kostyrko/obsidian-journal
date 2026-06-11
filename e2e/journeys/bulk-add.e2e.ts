import { browser, expect } from "@wdio/globals";

import {
  clickButton,
  clickDialogButton,
  closeSettings,
  openJournalSubpage,
  openSettings,
  setModalText,
  toggleModalCheckbox,
  waitForDialogClosed,
} from "../support/settings.js";
import { frontmatterOf, seedNote, waitForJournalFrontmatter } from "../support/vault.js";

// Slice B chunk 4 — bulk-add is NOT a palette command: it is the header button on the journal
// edit subpage (m.bulk_add_command()), so the flow is reached through the chunk-3 settings SPA.
// The seam under test is the real-vault scan (BulkAddService.plan) + the two-modal write
// (process modal -> BulkAddService.apply -> saveData), which __mocks__/obsidian.ts can't drive.
// Single boot; each it scans its own folder so the accumulating connections stay independent.

const BULK_ADD = "Bulk add notes to this journal";

async function runBulkAdd(folder: string): Promise<void> {
  await openSettings();
  await openJournalSubpage("core", "daily");
  await clickButton(BULK_ADD);
  // Configure modal: the folder is the first text input; date format defaults to YYYY-MM-DD.
  await setModalText(folder);
  // With the combinator at "no", the dry-run toggle (default on) is the dialog's only checkbox;
  // turn it off so the run actually writes.
  await toggleModalCheckbox();
  await clickDialogButton("Continue");
  // The process modal opens after plan() scans the vault; clickDialogButton("Run") waits for the
  // Run button to become clickable, which is the signal the process modal has rendered.
  await clickDialogButton("Run");
}

describe("bulk add", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  afterEach(closeSettings);

  it("attaches journal frontmatter to every matching note in the source folder", async () => {
    await seedNote("bulk-match/2030-09-01.md", "first\n");
    await seedNote("bulk-match/2030-09-02.md", "second\n");

    await runBulkAdd("bulk-match");

    await waitForJournalFrontmatter("bulk-match/2030-09-01.md", { journal: "daily", date: "2030-09-01" });
    await waitForJournalFrontmatter("bulk-match/2030-09-02.md", { journal: "daily", date: "2030-09-02" });
    await clickDialogButton("Close");
    await waitForDialogClosed();
  });

  it("leaves a note with no parseable date unconnected", async () => {
    await seedNote("bulk-skip/2030-10-05.md", "dated\n");
    await seedNote("bulk-skip/notes.md", "no date here\n");

    await runBulkAdd("bulk-skip");

    await waitForJournalFrontmatter("bulk-skip/2030-10-05.md", { journal: "daily", date: "2030-10-05" });
    const undatedFm = await frontmatterOf("bulk-skip/notes.md");
    expect(undatedFm?.journal).toBeUndefined();
    await clickDialogButton("Close");
    await waitForDialogClosed();
  });
});
