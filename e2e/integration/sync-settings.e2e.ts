import { browser, expect } from "@wdio/globals";

import { FixtureJournalMissingError } from "../support/errors.js";
import { getSettings, journalKeysOf, readRawSettings, writeRawSettings } from "../support/plugin-data.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";
import { seedNote, waitForJournalFrontmatter } from "../support/vault.js";

// Obsidian Sync writes data.json on disk and calls onExternalSettingsChange, which runs
// SettingsService.reload() -> emits "reloaded" -> VaultSubscriptionService rebuilds against the
// fresh journals. We add a second journal out of band (cloned from the fixture's daily journal, so
// no schema is hand-authored), fire the hook, and assert both that the original journal survives
// the reload and that the synced-in journal is live (a foreign note under its folder auto-attaches).
// The fixture boot is a copy, so the disk edit is isolated to this run.
describe("external settings sync", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("keeps the existing journal and activates a journal synced into data.json", async () => {
    const raw = (await readRawSettings()) ?? "{}";
    const settings = JSON.parse(raw) as {
      journals?: Record<string, Record<string, unknown>>;
    };
    const daily = settings.journals?.daily;
    if (!daily) throw new FixtureJournalMissingError("daily");

    settings.journals ??= {};
    settings.journals.diary = { ...daily, name: "diary", folder: "Diary" };
    await writeRawSettings(JSON.stringify(settings));
    await triggerExternalSettingsChange();

    // (a) the synced-in journal is live: a foreign note under its folder auto-attaches.
    await seedNote("Diary/2024-04-01.md", "");
    await waitForJournalFrontmatter("Diary/2024-04-01.md", { journal: "diary", date: "2024-04-01" });

    // (b) the reload did not wipe the original entity.
    const keys = journalKeysOf(await getSettings());
    expect(keys).toContain("daily");
    expect(keys).toContain("diary");
  });
});
