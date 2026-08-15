import { browser, expect } from "@wdio/globals";

import { createNote, frontmatterOf, waitForJournalFrontmatter } from "../support/vault.js";

// The `release` journal in the `e2e-sprint-index` fixture names notes
// `Release{{release}}Sprint{{sprint}}` — two digits, no date variable. Auto-attach must
// invert the pair as a mixed-radix numeral: release 4711 never resets, sprint runs 1..6, so
// (4712 - 4711) * 6 + (3 - 1) = 8 two-week steps past 2026-01-05 lands on 2026-04-27.
describe("auto-attach with a two-digit odometer template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-sprint-index", plugins: ["journals"] });
  });

  it("inverts both digits back to the period's anchor date", async () => {
    await createNote("Release4712Sprint3.md");

    await waitForJournalFrontmatter("Release4712Sprint3.md", { journal: "release", date: "2026-04-27" });
  });

  it("records both captured digits as numbering frontmatter", async () => {
    await createNote("Release4711Sprint2.md");
    await waitForJournalFrontmatter("Release4711Sprint2.md", { journal: "release", date: "2026-01-19" });

    const frontmatter = await frontmatterOf("Release4711Sprint2.md");

    expect(frontmatter?.["journal-release"]).toBe(4711);
    expect(frontmatter?.["journal-sprint"]).toBe(2);
  });

  it("leaves a note whose inner digit is outside its cycle unattached", async () => {
    // Wrapping sprint 9 would land it on the same anchor as Release4712Sprint3.
    await createNote("Release4711Sprint9.md");

    await browser.pause(2000);
    const frontmatter = await frontmatterOf("Release4711Sprint9.md");

    expect(frontmatter?.["journal-date"]).toBeUndefined();
  });
});
