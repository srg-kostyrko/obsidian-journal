import { browser, expect } from "@wdio/globals";

import {
  clickDialogButton,
  clickIcon,
  closeSettings,
  openSettings,
  openShelfSubpage,
  selectModalDropdownByLabel,
  setModalText,
  toggleModalCheckbox,
  waitForDialogClosed,
} from "../support/settings.js";
import { frontmatterOf, seedNote, waitForContent, waitForJournalFrontmatter } from "../support/vault.js";

// Slice B chunk 4 — bulk-add is NOT a palette command: it is the per-journal icon button in the
// journals list of the settings dashboard (m.journal_dashboard_bulk_add()), so the flow is reached
// through the chunk-3 settings SPA. The seam under test is the real-vault scan (BulkAddService.plan)
// + the two-modal write (process modal -> BulkAddService.apply -> saveData), which
// __mocks__/obsidian.ts can't drive.
// Single boot; each it scans its own folder so the accumulating connections stay independent.

const BULK_ADD = "Bulk add notes to daily";
const EXISTING_LABEL = "When a note is already connected to that date";

async function runBulkAdd(folder: string, options: { existing?: "override" | "merge" } = {}): Promise<void> {
  await openSettings();
  // The dashboard lists only shelf-less journals; daily lives on the "core" shelf, so its
  // per-row bulk-add icon is reached through the shelf subpage.
  await openShelfSubpage("core");
  await clickIcon(BULK_ADD);
  await setModalText(folder);
  // Set the occupant policy up front in the configure modal so the process modal needs no per-note
  // picker (the per-note dropdown renders only when the policy is "ask").
  if (options.existing) {
    await selectModalDropdownByLabel(EXISTING_LABEL, options.existing);
  }
  // With the combinator at "no", the dry-run toggle (default on) is the dialog's only checkbox;
  // turn it off so the run actually writes.
  await toggleModalCheckbox();
  await clickDialogButton("Continue");
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

  it("replaces the occupant when the override policy is chosen", async () => {
    // An occupant already owns the 2031-01-01 anchor; the source carries the same date elsewhere.
    await seedNote("day/2031-01-01.md", "---\njournal: daily\njournal-date: 2031-01-01\n---\noccupant\n");
    await waitForJournalFrontmatter("day/2031-01-01.md", { journal: "daily", date: "2031-01-01" });
    await seedNote("bulk-override/2031-01-01.md", "incoming\n");

    await runBulkAdd("bulk-override", { existing: "override" });

    // The source becomes the connected note for the anchor; the former occupant is disconnected.
    await waitForJournalFrontmatter("bulk-override/2031-01-01.md", { journal: "daily", date: "2031-01-01" });
    const occupantFm = await frontmatterOf("day/2031-01-01.md");
    expect(occupantFm?.journal).toBeUndefined();
    await clickDialogButton("Close");
    await waitForDialogClosed();
  });

  it("merges the source into the occupant and deletes the source when the merge policy is chosen", async () => {
    await seedNote("day/2031-02-01.md", "---\njournal: daily\njournal-date: 2031-02-01\n---\noccupant body\n");
    await waitForJournalFrontmatter("day/2031-02-01.md", { journal: "daily", date: "2031-02-01" });
    await seedNote("bulk-merge/2031-02-01.md", "merged source line\n");

    await runBulkAdd("bulk-merge", { existing: "merge" });

    // The occupant absorbs the source content; the source file is trashed.
    await waitForContent(
      "day/2031-02-01.md",
      (content) => content.includes("merged source line"),
      "occupant note did not absorb the merged source content",
    );
    // frontmatterOf serializes undefined as null over the WebDriver wire; null confirms the source
    // path is gone (trashed) — a live file with no frontmatter also returns null, but combined with
    // the waitForContent guard above this is enough to confirm the merge-and-delete happened.
    const sourceFm = await frontmatterOf("bulk-merge/2031-02-01.md");
    expect(sourceFm).toBeNull();
    await clickDialogButton("Close");
    await waitForDialogClosed();
  });
});
