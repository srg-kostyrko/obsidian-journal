import { browser } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

import { waitForSettingsVersion } from "../support/plugin-data.js";

import { waitForMigratedNote } from "./helpers.js";

// Slice C — the migration seam, mid-session. The community-store upgrade path does
// not restart Obsidian: it disables the old plugin and enables the new one while the
// app keeps running, so onload fires with the workspace layout already ready and
// metadataCache already resolved. That is a different branch from the cold boot the
// other spec covers, and the one most real upgrades take. Booting with journals
// disabled lets the vault fully settle before it loads; enabling it then must still
// run the migration. If Obsidian did not invoke onLayoutReady for a late registrant,
// the walk would never start — a failure mode the mock cannot reproduce.
describe("legacy upgrade on mid-session enable", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-legacy-v1", plugins: [] });
    await obsidianPage.enablePlugin("journals");
  });

  it("rewrites a legacy note when enabled after startup is complete", async () => {
    await waitForMigratedNote("archive/day-note.md", { journal: "My Journal Day", date: "2024-03-10" });
  });

  it("upgrades the stored data.json when enabled after startup is complete", async () => {
    await waitForSettingsVersion();
  });
});
