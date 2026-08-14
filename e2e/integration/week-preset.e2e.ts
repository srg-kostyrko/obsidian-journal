import { $, browser, expect } from "@wdio/globals";

import { NAV_FENCE, NAV_NOT_CONNECTED, NAV_VIEW, openInReadingMode } from "../journeys/code-blocks.js";
import { clickButton, clickRowButton, expandSection, openSettings } from "../support/settings.js";
import { frontmatterOf, seedNote, waitForFrontmatter, waitForJournalFrontmatter } from "../support/vault.js";

// Changing the week preset moves the week grid, so every weekly note's stored date stops being
// its week's first day. parseEntry rejects a non-canonical anchor, so an un-re-anchored note
// silently drops out of JournalsIndex and its calendar cell reads as empty. That drop only
// happens through Obsidian's real metadataCache round-trip, which unit tests do not exercise.

async function switchToWesternPreset(): Promise<void> {
  await openSettings();
  await expandSection("Calendar");
  await clickButton("Change");
  await clickRowButton("Western traditional", "Use");
  await clickButton("Update");
}

describe("week preset change", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-week-preset", plugins: ["journals"] });
  });

  it("moves a connected weekly note's date onto the new grid", async () => {
    // vault.create refuses to write into a folder that doesn't exist on disk yet, and this
    // fixture carries no note folders; seedNote creates "week/" first, same as a real user's
    // first weekly note would need someone (or the plugin) to have done.
    await seedNote("week/2026-W23.md", "");
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await switchToWesternPreset();

    await waitForFrontmatter(
      "week/2026-W23.md",
      (frontmatter) => frontmatter["journal-date"] === "2026-05-31",
      "weekly note was not re-anchored onto the Western week grid",
    );
  });

  it("updates the note's start and end dates to the new week", async () => {
    // vault.create refuses to write into a folder that doesn't exist on disk yet, and this
    // fixture carries no note folders; seedNote creates "week/" first, same as a real user's
    // first weekly note would need someone (or the plugin) to have done.
    await seedNote("week/2026-W23.md", "");
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await switchToWesternPreset();

    await waitForFrontmatter(
      "week/2026-W23.md",
      (frontmatter) => frontmatter["journal-start-date"] === "2026-05-31",
      "weekly note's start date was not recomputed",
    );
    const frontmatter = await frontmatterOf("week/2026-W23.md");
    expect(frontmatter?.["journal-end-date"]).toBe("2026-06-06");
  });

  it("keeps the note registered in the journal index after the change", async () => {
    // vault.create refuses to write into a folder that doesn't exist on disk yet, and this
    // fixture carries no note folders; seedNote creates "week/" first, same as a real user's
    // first weekly note would need someone (or the plugin) to have done. The nav fence is the
    // observable: parseEntry rejects a non-canonical anchor, so a note that fell out of
    // JournalsIndex renders the not-connected fallback instead of .nav-view.
    await seedNote("week/2026-W23.md", NAV_FENCE);
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await switchToWesternPreset();

    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-05-31" });
    await openInReadingMode("week/2026-W23.md");
    await $(NAV_VIEW).waitForExist({
      timeoutMsg: "re-anchored note dropped out of the journal index",
    });
    await expect($(NAV_NOT_CONNECTED)).not.toExist();
  });
});
