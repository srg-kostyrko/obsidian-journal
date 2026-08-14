import { browser } from "@wdio/globals";

import { clickDialogButton, waitForDialogClosed } from "../support/settings.js";
import { waitForActiveNoteIn, waitForFrontmatter } from "../support/vault.js";

// The confirmCreation gate and the open-on-startup seam meet here. On a cold boot the plugin's
// StartupOpenService opens the configured journal's entry via OpenJournalEntryFlow -> ensureNote,
// and because the daily journal has confirmCreation=true and the fixture carries no day notes, the
// entry has to be created — so the "Create a new journal note?" dialog is raised during startup,
// before any note is written. Accepting it lets the entry be created and opened. Neither the
// startup-open nor the confirm-creation journey exercises this crossing: the former uses a journal
// without confirmCreation, the latter reaches the gate via URI rather than the boot path.
describe("confirm note creation on startup", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-startup-confirm", plugins: ["journals"] });
  });

  it("prompts for confirmation on launch and opens the entry when accepted", async () => {
    // The dialog's Create button becoming clickable is the proof the gate fired during startup;
    // clicking it releases the same today's-entry creation the plain startup journey asserts.
    await clickDialogButton("Create");
    await waitForDialogClosed();
    const path = await waitForActiveNoteIn("day");
    await waitForFrontmatter(
      path,
      (frontmatter) => frontmatter.journal === "daily",
      `${path} did not attach journal=daily frontmatter`,
    );
  });
});
