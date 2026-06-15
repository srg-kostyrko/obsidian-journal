import { browser, expect } from "@wdio/globals";

import { clickDialogButton, waitForDialogClosed } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import { frontmatterOf, waitForJournalFrontmatter } from "../support/vault.js";

// A journal with confirmCreation=true gates NoteCreationService.ensureNote behind a modal. Opening
// an entry via the journals:// URI routes through OpenJournalEntryFlow -> ensureNote, which opens
// the "Create a new journal note?" dialog before writing. Accepting creates the note; cancelling
// aborts (UserAborted) and leaves no file. Fixed future dates avoid any collision with today.
describe("confirm note creation", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-confirm", plugins: ["journals"] });
  });

  it("creates the note when the confirmation is accepted", async () => {
    await openViaUri({ journal: "daily", date: "2030-07-15" });
    await clickDialogButton("Create");
    await waitForDialogClosed();
    await waitForJournalFrontmatter("2030-07-15.md", { journal: "daily", date: "2030-07-15" });
  });

  it("does not create the note when the confirmation is cancelled", async () => {
    await openViaUri({ journal: "daily", date: "2030-08-20" });
    await clickDialogButton("Cancel");
    await waitForDialogClosed();
    // Cancel maps to UserAborted before any write, so the file never exists. frontmatterOf returns
    // undefined for a missing file, which the WebDriver wire serializes as null at the Node boundary.
    expect(await frontmatterOf("2030-08-20.md")).toBeNull();
  });
});
