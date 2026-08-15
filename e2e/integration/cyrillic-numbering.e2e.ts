import { browser, expect } from "@wdio/globals";

import { openViaUri } from "../support/uri.js";
import { createNote, frontmatterOf, waitForJournalFrontmatter } from "../support/vault.js";

// The `e2e-cyrillic-numbering` fixture defines a single custom 2-week journal, key "реліз",
// whose name template is `Реліз{{реліз}}Спринт{{спринт}}` — both the variable names and the
// surrounding literal text are Cyrillic. This exercises both directions the widened
// NAME_PREFIX_RE / NUMBERING_VARIABLE_RE need to cover: the plugin rendering a note name from
// Cyrillic-keyed numbering sources, and auto-attach parsing a hand-created Cyrillic filename
// back into those sources. release (реліз) starts at 4711 and never resets; sprint (спринт)
// starts at 1 and resets every 6, so interval #8 past the anchor is release 4712, sprint 3:
// (4712 - 4711) * 6 + (3 - 1) = 8 two-week steps past 2026-01-05 lands on 2026-04-27.
describe("Cyrillic numbering variable names", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-cyrillic-numbering", plugins: ["journals"] });
  });

  it("renders a Cyrillic name template through the note-creation path", async () => {
    await openViaUri({ journal: "реліз", date: "2026-04-27" });

    await waitForJournalFrontmatter("Реліз4712Спринт3.md", { journal: "реліз", date: "2026-04-27" });

    const frontmatter = await frontmatterOf("Реліз4712Спринт3.md");
    expect(frontmatter?.["journal-release"]).toBe(4712);
    expect(frontmatter?.["journal-sprint"]).toBe(3);
  });

  it("parses and attaches a hand-created note with a Cyrillic filename", async () => {
    await createNote("Реліз4711Спринт2.md");

    await waitForJournalFrontmatter("Реліз4711Спринт2.md", { journal: "реліз", date: "2026-01-19" });

    const frontmatter = await frontmatterOf("Реліз4711Спринт2.md");
    expect(frontmatter?.["journal-release"]).toBe(4711);
    expect(frontmatter?.["journal-sprint"]).toBe(2);
  });
});
