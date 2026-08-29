import { browser } from "@wdio/globals";

import { createNote, waitForContent, waitForJournalFrontmatter } from "../support/vault.js";

// The `e2e-daily-template` fixture is a daily journal whose notes carry a template
// (`Templates/daily.md`). Auto-attach connects a link-created note by writing journal
// frontmatter; the regression this guards is that writing frontmatter fills the file, so a
// naive emptiness check skips the template. Only real Obsidian embeds frontmatter into the
// file body, so this seam is unreachable against __mocks__/obsidian.ts.
//
// `daily` defines no creation prompts, so AutoAttachService's detect -> prompt -> rename ->
// attach branch never triggers here and this stays the direct attach path: a link click still
// goes straight from "created" to attached frontmatter with no dialog in between. The prompted
// branch — a placeholder-named file that has to be answered, renamed and only then attached —
// is covered separately in e2e/journeys/creation-prompts.e2e.ts.
describe("auto-attach template", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily-template", plugins: ["journals"] });
  });

  it("applies the journal template immediately, with no creation prompt in the way", async () => {
    await createNote("links.md", "see [[2024-02-20]]\n");
    await browser.executeObsidian(
      async ({ app }, linkText, source) => {
        await app.workspace.openLinkText(linkText, source, false);
      },
      "2024-02-20",
      "links.md",
    );

    await waitForJournalFrontmatter("2024-02-20.md", { journal: "daily", date: "2024-02-20" });
    await waitForContent(
      "2024-02-20.md",
      (content) => content.includes("Template body applied.") && content.includes("# Daily 2024-02-20"),
      "waited for the daily template body to be applied to the link-created note",
    );
  });
});
