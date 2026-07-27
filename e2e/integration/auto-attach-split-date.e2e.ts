import { browser } from "@wdio/globals";

import { createNote, waitForJournalFrontmatter } from "../support/vault.js";

// The `e2e-split-date` fixture's daily journal spreads the entry date across folder
// segments and the filename (`Journals/{{date:YYYY}}/{{date:MM}}/{{date:DD}}`). Clicking a
// link to a not-yet-created entry makes Obsidian create a plain note at that nested path with
// no journal frontmatter, so auto-attach must invert the whole path back to a date and
// connect it. Reversing a date split across parts is exactly what regressed; only real
// Obsidian creates the nested folders and drives the metadataCache indexing this depends on.
describe("auto-attach split date", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-split-date", plugins: ["journals"] });
  });

  it("attaches a link-created note whose date is split across folder and filename", async () => {
    await createNote("links.md", "see [[Journals/2026/05/19]]\n");
    await browser.executeObsidian(
      async ({ app }, linkText, source) => {
        await app.workspace.openLinkText(linkText, source, false);
      },
      "Journals/2026/05/19",
      "links.md",
    );

    await waitForJournalFrontmatter("Journals/2026/05/19.md", { journal: "daily", date: "2026-05-19" });
  });
});
