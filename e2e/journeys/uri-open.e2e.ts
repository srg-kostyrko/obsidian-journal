import { browser, expect } from "@wdio/globals";

import { promptChoose, waitForPrompt } from "../support/commands.js";
import { openViaUri } from "../support/uri.js";
import {
  closeAllLeaves,
  markdownLeafCount,
  openNote,
  seedNote,
  waitForActiveNote,
  waitForActiveNoteIn,
  waitForFrontmatter,
  waitForJournalFrontmatter,
} from "../support/vault.js";

// The obsidian://journals protocol seam. We fire the registered handler the way Obsidian does
// (see support/uri.ts) and assert a real note opens in a real vault — exercising boot-time
// registration, write-type targeting, open mode, and the multi-candidate picker, none of which
// the unit suite's mocked flow reaches. The fixture carries two day journals (work, personal)
// so a `type=day` query has two candidates, and one week journal (weekly) so `type=week` has one.
describe("open via uri", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-uri", plugins: ["journals"] });
    await seedNote("baseline.md", "baseline\n");
  });

  describe("by journal name", () => {
    it("opens the journal's entry for an explicit date", async () => {
      await openViaUri({ journal: "work", date: "2027-04-05" });
      await waitForActiveNote("work/2027-04-05.md");
      await waitForJournalFrontmatter("work/2027-04-05.md", { journal: "work", date: "2027-04-05" });
    });

    it("opens the entry in a new tab when mode is tab", async () => {
      await closeAllLeaves();
      await openNote("baseline.md");
      const before = await markdownLeafCount();

      await openViaUri({ journal: "work", date: "2027-06-01", mode: "tab" });
      await waitForActiveNote("work/2027-06-01.md");

      expect(await markdownLeafCount()).toBe(before + 1);
    });
  });

  describe("by write type", () => {
    it("opens the sole journal of the write type without prompting", async () => {
      await openViaUri({ type: "week", date: "2027-04-05" });
      const path = await waitForActiveNoteIn("week");
      await waitForFrontmatter(
        path,
        (frontmatter) => frontmatter.journal === "weekly",
        `${path} did not attach journal=weekly frontmatter`,
      );
    });

    it("prompts the journal picker when the write type matches several journals", async () => {
      await openViaUri({ type: "day", date: "2027-04-05" });
      await waitForPrompt("Search journals");
      await promptChoose("personal");

      await waitForActiveNote("personal/2027-04-05.md");
      await waitForJournalFrontmatter("personal/2027-04-05.md", { journal: "personal", date: "2027-04-05" });
    });
  });
});
