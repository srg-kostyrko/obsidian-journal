import { browser, expect } from "@wdio/globals";

import { createNote, frontmatterOf, waitForJournalFrontmatter } from "../support/vault.js";

// The `e2e-sprint-index` fixture commits a custom 2-week journal whose notes live at
// `Sprint {{index}}` — an index-only name template with no date variable. Auto-attach must
// reverse the captured index back to the sprint's anchor date (anchorDate 2026-01-05,
// anchorValue 1, so index 3 is two 2-week steps later = 2026-02-02). This exercises the
// numbering-inversion path that __mocks__/obsidian.ts can't reproduce, and proves the real
// NotePathService -> NumberingService wiring boots without a DI cycle.
describe("auto-attach with an index-only template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-sprint-index", plugins: ["journals"] });
  });

  it("reverses the index to the sprint anchor date for a foreign note", async () => {
    await createNote("Sprint 3.md");

    await waitForJournalFrontmatter("Sprint 3.md", { journal: "sprint", date: "2026-02-02" });
  });

  it("records the captured index as numbering frontmatter", async () => {
    await createNote("Sprint 4.md");
    await waitForJournalFrontmatter("Sprint 4.md", { journal: "sprint", date: "2026-02-16" });

    const frontmatter = await frontmatterOf("Sprint 4.md");

    expect(frontmatter?.["journal-index"]).toBe(4);
  });
});
