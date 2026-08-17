import { browser } from "@wdio/globals";

import { createNote, waitForJournalFrontmatter } from "../support/vault.js";

// The `e2e-split-date` fixture spreads each journal's entry date across folder segments and
// the filename — `Journals/{{date:YYYY}}/{{date:MM}}/{{date:DD}}` for the daily journal,
// `Quarters/{{date:YYYY}}` + `{{date:[Q]Q}}` for the quarterly one. Clicking a link to a
// not-yet-created entry makes Obsidian create a plain note at that nested path with no journal
// frontmatter, so auto-attach must invert the whole path back to a date and connect it.
// Reversing a date split across parts is exactly what regressed; only real Obsidian creates
// the nested folders and drives the metadataCache indexing this depends on.
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

  // The same split, but the filename names a period *within* the year rather than a narrower
  // calendar field. That routed around the component combiner entirely: each capture was parsed
  // on its own and their lower bounds had to match, so the year token's 1 January lost to the
  // quarter's own start, and the quarter — carrying no year — defaulted to the current one.
  // Only Q1 of the current year ever agreed, so this note was never adopted. Quarters do not
  // move with the locale's week grid, which is why this case is pinned exactly and the weekly
  // one is not.
  it("attaches a link-created note whose quarter is split from its year folder", async () => {
    await createNote("quarter-links.md", "see [[Quarters/2027/Q3]]\n");
    await browser.executeObsidian(
      async ({ app }, linkText, source) => {
        await app.workspace.openLinkText(linkText, source, false);
      },
      "Quarters/2027/Q3",
      "quarter-links.md",
    );

    await waitForJournalFrontmatter("Quarters/2027/Q3.md", { journal: "quarterly", date: "2027-07-01" });
  });
});
