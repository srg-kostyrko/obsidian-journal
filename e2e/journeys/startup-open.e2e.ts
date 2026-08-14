import { browser } from "@wdio/globals";

import { waitForActiveNoteIn, waitForFrontmatter } from "../support/vault.js";

// The open-on-startup seam: StartupOpenService captures appStartup from layoutReady at onload and,
// when the plugin boots with the app (layout not yet ready), opens the configured journal's entry
// on onLayoutReady via OpenJournalEntryFlow. That flow has no other caller, so a cold boot is the
// only place it runs in a real app — a branch the mocked unit suite cannot reproduce, since it
// hinges on Obsidian invoking onLayoutReady for a boot-time registrant. The fixture configures the
// daily journal as the startup journal and carries no day notes, so the entry is created and opened.
describe("open on startup", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-startup", plugins: ["journals"] });
  });

  it("opens the configured journal's entry on launch", async () => {
    // The date is "today" at boot time, so we assert the journal folder and tag rather than a
    // pinned path: startup resolved the daily journal and opened its entry for today.
    const path = await waitForActiveNoteIn("day");
    await waitForFrontmatter(
      path,
      (frontmatter) => frontmatter.journal === "daily",
      `${path} did not attach journal=daily frontmatter`,
    );
  });
});
