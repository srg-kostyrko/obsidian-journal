import { browser, expect } from "@wdio/globals";

import { createNote, frontmatterOf, renameNote, waitForJournalFrontmatter } from "../support/vault.js";

// Slice A — the integration seam. The `daily` fixture commits a journal whose
// notes live at `{{date}}.md` (YYYY-MM-DD), so a foreign vault mutation at a
// matching path must drive real metadataCache indexing -> auto-attach -> a
// frontmatter write the test observes. None of this would fail against
// __mocks__/obsidian.ts, which can't reproduce the indexing window.
describe("auto-attach", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/daily", plugins: ["journals"] });
  });

  it("attaches journal frontmatter to a foreign note created at a matching path", async () => {
    await createNote("2024-01-15.md");

    await waitForJournalFrontmatter("2024-01-15.md", { journal: "daily", date: "2024-01-15" });
  });

  it("attaches journal frontmatter when a note is renamed into a matching path", async () => {
    await createNote("draft.md");

    await renameNote("draft.md", "2024-01-16.md");

    await waitForJournalFrontmatter("2024-01-16.md", { journal: "daily", date: "2024-01-16" });
  });

  it("leaves a note at a non-matching path untouched", async () => {
    await createNote("groceries.md");
    // A matching note created alongside is the deterministic checkpoint: once it
    // attaches, the auto-attach event loop has demonstrably run, so the absence
    // on the non-matching note is a real negative, not an unobserved race.
    await createNote("2024-01-17.md");
    await waitForJournalFrontmatter("2024-01-17.md", { journal: "daily", date: "2024-01-17" });

    const frontmatter = await frontmatterOf("groceries.md");

    expect(frontmatter?.journal).toBeUndefined();
  });
});
