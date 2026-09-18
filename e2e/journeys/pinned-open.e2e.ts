import { browser, expect } from "@wdio/globals";

import { openViaUri } from "../support/uri.js";
import {
  closeAllLeaves,
  closePopoutWindows,
  mainWindowHoldsNote,
  markdownLeafCount,
  openNote,
  pinNote,
  pinnedNotePaths,
  seedNote,
  waitForActiveNote,
} from "../support/vault.js";

// A pinned open must reuse the journal's pinned tab through Obsidian's real leaf API: pin state,
// getViewState, and openFile on a pinned leaf are all things the unit fake only imitates.
describe("open a journal note pinned", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-uri", plugins: ["journals"] });
    await seedNote("baseline.md", "baseline\n");
  });

  afterEach(closePopoutWindows);

  it("opens the entry in a pinned tab", async () => {
    await closeAllLeaves();
    await openNote("baseline.md");

    await openViaUri({ journal: "work", date: "2027-07-01", mode: "tab", pinned: "true" });
    await waitForActiveNote("work/2027-07-01.md");

    expect(await pinnedNotePaths()).toEqual(["work/2027-07-01.md"]);
  });

  it("moves the journal's pinned tab to another date instead of pinning a second", async () => {
    await closeAllLeaves();
    await openViaUri({ journal: "work", date: "2027-07-02", mode: "tab", pinned: "true" });
    await waitForActiveNote("work/2027-07-02.md");
    const before = await markdownLeafCount();

    await openViaUri({ journal: "work", date: "2027-07-03", mode: "tab", pinned: "true" });
    await waitForActiveNote("work/2027-07-03.md");

    expect(await markdownLeafCount()).toBe(before);
    expect(await pinnedNotePaths()).toEqual(["work/2027-07-03.md"]);
  });

  it("leaves another journal's pinned tab alone", async () => {
    await closeAllLeaves();
    await openViaUri({ journal: "personal", date: "2027-07-04", mode: "tab" });
    await waitForActiveNote("personal/2027-07-04.md");
    await pinNote("personal/2027-07-04.md");

    await openViaUri({ journal: "work", date: "2027-07-04", mode: "tab", pinned: "true" });
    await waitForActiveNote("work/2027-07-04.md");

    expect(await pinnedNotePaths()).toEqual(["personal/2027-07-04.md", "work/2027-07-04.md"]);
  });

  it("moves the journal's pinned tab in the main window while a popout has focus", async () => {
    await closeAllLeaves();
    await openNote("baseline.md");
    await openViaUri({ journal: "work", date: "2027-07-05", mode: "tab", pinned: "true" });
    await waitForActiveNote("work/2027-07-05.md");

    // An unrelated note opened into a popout takes focus there naturally — no need to drive focus
    // ourselves, which is what made the previous version of this test unable to reach its own
    // assertions (see focusMainWindow's popout-focus flake).
    await openViaUri({ journal: "personal", date: "2027-07-05", mode: "window" });
    await waitForActiveNote("personal/2027-07-05.md");
    await browser.waitUntil(
      async () =>
        browser.executeObsidian(
          ({ app }) => app.workspace.containerEl.win.activeWindow !== app.workspace.containerEl.win,
        ),
      { timeoutMsg: "focus never moved to the popout window" },
    );
    const before = await markdownLeafCount();

    await openViaUri({ journal: "work", date: "2027-07-06", pinned: "true" });
    await waitForActiveNote("work/2027-07-06.md");

    expect(await markdownLeafCount()).toBe(before);
    expect(await pinnedNotePaths()).toEqual(["work/2027-07-06.md"]);
    expect(await mainWindowHoldsNote("work/2027-07-06.md")).toBe(true);
  });
});
