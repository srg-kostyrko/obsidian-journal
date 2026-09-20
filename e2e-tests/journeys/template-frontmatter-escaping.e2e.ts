import { browser } from "@wdio/globals";

import { setModalRowText, submitModal, waitForModalOpen } from "../support/settings.js";
import { openViaUri } from "../support/uri.js";
import { seedNote, waitForFrontmatter, waitForJournalFrontmatter } from "../support/vault.js";

// A plain Text answer used to be pasted into the template's frontmatter unescaped: `: ` made
// processFrontMatter throw, leaving the note unattached, and ` #` silently cut the value short.
describe("a text answer in a template's frontmatter", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-long-text", plugins: ["journals"] });
    // `title` is a reserved variable, so the questions are `headline` and `label`; the property
    // names are free.
    await seedNote("Templates/summarized.md", "---\ntitle: {{headline}}\ntag: {{label}}\n---\nBody\n");
  });

  it("creates and attaches the note with both values intact", async () => {
    await openViaUri({ journal: "summarized", date: "2030-07-22" });
    await waitForModalOpen();
    await setModalRowText("Headline?", "rough: day");
    await setModalRowText("Label?", "great #win");
    await submitModal();

    await waitForJournalFrontmatter("2030-07-22.md", { journal: "summarized", date: "2030-07-22" });
    await waitForFrontmatter(
      "2030-07-22.md",
      (frontmatter) => frontmatter.title === "rough: day" && frontmatter.tag === "great #win",
      "waited for the title and tag to read back intact",
    );
  });
});
