import { browser, expect } from "@wdio/globals";

import { promptChoose, waitForPrompt } from "../support/commands.js";
import { openViaUri } from "../support/uri.js";
import {
  closeAllLeaves,
  closePopoutWindows,
  focusMainWindow,
  frontmatterOf,
  mainWindowHoldsNote,
  markdownLeafCount,
  openNote,
  popoutWindowCount,
  rootSplitChildCount,
  seedNote,
  waitForActiveNote,
  waitForActiveNoteIn,
  waitForContent,
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
    // The weekly journal points at this template; seed it so a URI-created weekly entry
    // has a template body to apply (issue #85).
    await seedNote("uri-weekly-template.md", "Weekly template for {{journal_name}}.\n");
  });

  // A leaked popout stays the active window and steals the next spec's modals, so the cleanup
  // has to survive a failing assertion — inline at the end of a test, it is skipped by the very
  // failures that make the leak matter.
  afterEach(closePopoutWindows);

  describe("by journal name", () => {
    it("opens the journal's entry for an explicit date", async () => {
      await openViaUri({ journal: "work", date: "2027-04-05" });
      await waitForActiveNote("work/2027-04-05.md");
      await waitForJournalFrontmatter("work/2027-04-05.md", { journal: "work", date: "2027-04-05" });
    });
  });

  describe("relocated entry", () => {
    it("reopens the indexed note at its real path instead of duplicating it", async () => {
      // The note is connected to the anchor but lives away from the config-derived
      // work/<date>.md path (as after a manual rename or an in-place connect). The open
      // pipeline must resolve it through the index, not re-derive the path and create a twin.
      await seedNote("elsewhere/moved entry.md", "---\njournal: work\njournal-date: 2027-08-16\n---\nkept body\n");
      await waitForJournalFrontmatter("elsewhere/moved entry.md", { journal: "work", date: "2027-08-16" });

      await openViaUri({ journal: "work", date: "2027-08-16" });
      await waitForActiveNote("elsewhere/moved entry.md");

      expect(await frontmatterOf("work/2027-08-16.md")).toBeNull();
    });
  });

  // The note-open seam routes each mode through getLeaf(toPaneType(mode)). active is the default and
  // is exercised by every other open here; tab/split/window each route through a non-default pane
  // type. Obsidian API changes have silently broken split/window before — the note fell back into
  // the active leaf — which a unit test of the pure mode->paneType mapping cannot catch. Only
  // opening in a real workspace and observing where the leaf landed does.
  describe("open mode", () => {
    it("opens the entry in a new tab when mode is tab", async () => {
      await closeAllLeaves();
      await openNote("baseline.md");
      const before = await markdownLeafCount();

      await openViaUri({ journal: "work", date: "2027-06-01", mode: "tab" });
      await waitForActiveNote("work/2027-06-01.md");

      expect(await markdownLeafCount()).toBe(before + 1);
    });

    it("opens the entry in a split pane when mode is split", async () => {
      await closeAllLeaves();
      await openNote("baseline.md");
      const before = await rootSplitChildCount();

      await openViaUri({ journal: "work", date: "2027-06-02", mode: "split" });
      await waitForActiveNote("work/2027-06-02.md");

      // A split adds a pane beside the active one, so the root split gains a child; a tab would have
      // reused the existing group and left this unchanged. That delta is what tells them apart.
      await browser.waitUntil(async () => (await rootSplitChildCount()) === before + 1, {
        timeoutMsg: "split mode did not add a pane to the root split",
      });
    });

    it("opens the entry in a popout window when mode is window", async () => {
      await closeAllLeaves();
      await openNote("baseline.md");
      const before = await popoutWindowCount();

      await openViaUri({ journal: "work", date: "2027-06-03", mode: "window" });
      await waitForActiveNote("work/2027-06-03.md");

      await browser.waitUntil(async () => (await popoutWindowCount()) === before + 1, {
        timeoutMsg: "window mode did not open a popout window",
      });
    });
  });

  // Opening a note that is already open reuses its leaf. Obsidian's leaf lookup spans popout
  // windows, so an unscoped reuse pulls the user into whichever window happens to hold the note,
  // and it also swallows an explicit tab/split/window request. Neither is reachable in the unit
  // suite: both need a real second window and a real workspace to open into.
  describe("entry already open", () => {
    it("opens the entry here when it is only open in a popout window", async () => {
      await closeAllLeaves();
      await openNote("baseline.md");
      await openViaUri({ journal: "work", date: "2027-06-04", mode: "window" });
      await waitForActiveNote("work/2027-06-04.md");
      await focusMainWindow();

      await openViaUri({ journal: "work", date: "2027-06-04" });
      await waitForActiveNote("work/2027-06-04.md");

      expect(await mainWindowHoldsNote("work/2027-06-04.md")).toBe(true);
    });

    it("opens a second pane for an explicit tab mode when the entry is already open", async () => {
      await closeAllLeaves();
      await openViaUri({ journal: "work", date: "2027-06-05" });
      await waitForActiveNote("work/2027-06-05.md");
      const before = await markdownLeafCount();

      await openViaUri({ journal: "work", date: "2027-06-05", mode: "tab" });

      await browser.waitUntil(async () => (await markdownLeafCount()) === before + 1, {
        timeoutMsg: "tab mode reused the leaf already holding the entry instead of adding one",
      });
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

  describe("template application", () => {
    it("applies the journal's note template to a URI-created entry", async () => {
      await openViaUri({ journal: "weekly", date: "2027-09-06" });
      const path = await waitForActiveNoteIn("week");
      await waitForContent(
        path,
        (content) => content.includes("Weekly template for weekly."),
        `${path} did not receive the rendered template body`,
      );
    });
  });
});
