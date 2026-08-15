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

// The same fixture carries two more index-only journals whose name templates exercise the
// number modifications: `PI {{index+3}}` and `Cycle {{index:o}}`. Both share the sprint's
// 2-week cycle (anchorDate 2026-01-05, anchorValue 1), so index 3 is 2026-02-02. Neither
// template holds a date variable — with one, the anchor would come from the date and the
// numbering inversion would never run.
describe("auto-attach with an offset index template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-sprint-index", plugins: ["journals"] });
  });

  it("subtracts the offset before reversing the index to an anchor date", async () => {
    await createNote("PI 6.md");

    // A rendered 6 is index 3, two 2-week steps past anchorValue 1. Without the offset
    // unapplied it reads as index 6 — five steps — and attaches at 2026-03-16.
    await waitForJournalFrontmatter("PI 6.md", { journal: "pi", date: "2026-02-02" });
  });

  it("records the offset-corrected index as numbering frontmatter", async () => {
    await createNote("PI 8.md");
    await waitForJournalFrontmatter("PI 8.md", { journal: "pi", date: "2026-03-02" });

    const frontmatter = await frontmatterOf("PI 8.md");

    expect(frontmatter?.["journal-index"]).toBe(5);
  });

  it("reverses an ordinal index to an anchor date", async () => {
    await createNote("Cycle 3rd.md");
    await waitForJournalFrontmatter("Cycle 3rd.md", { journal: "cycle", date: "2026-02-02" });

    const frontmatter = await frontmatterOf("Cycle 3rd.md");

    expect(frontmatter?.["journal-index"]).toBe(3);
  });
});
