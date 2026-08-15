import { $, browser, expect } from "@wdio/globals";

import { NAV_FENCE, NAV_NOT_CONNECTED, NAV_VIEW, openInReadingMode } from "../journeys/code-blocks.js";
import { readRawSettings, writeRawSettings } from "../support/plugin-data.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";
import { seedNote, waitForFrontmatter, waitForJournalFrontmatter } from "../support/vault.js";

// The week grid has two write paths into the same calendar slice. The preset picker routes through
// WeekPresetService.apply(), which snapshots week identity, writes the slice and re-anchors as one
// unit — week-preset.e2e.ts covers it. A data.json arriving from Obsidian Sync takes the other
// path: onExternalSettingsChange -> SettingsService.reload() -> #refresh mutates the reactive root,
// CalendarSettingsBridge installs the new grid, and nothing re-anchors. The note keeps a stored
// date that is no longer its week's first day, parseEntry rejects it as non-canonical, and it
// drops out of JournalsIndex — the nav fence renders the not-connected fallback over a file that
// is sitting right there.
//
// Same fixture, same note and same target grid as the picker spec, so the correct outcome is not
// in question: 2026-06-01 (ISO) must become 2026-05-31 (Western) either way.

const WESTERN_CALENDAR = { mode: "custom", dow: 0, doy: 6, global: false };

async function syncWesternWeekGrid(): Promise<void> {
  const raw = (await readRawSettings()) ?? "{}";
  const settings = JSON.parse(raw) as Record<string, unknown>;
  settings.calendar = WESTERN_CALENDAR;
  await writeRawSettings(JSON.stringify(settings));
  await triggerExternalSettingsChange();
}

describe("week grid arriving from settings sync", () => {
  beforeEach(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-week-preset", plugins: ["journals"] });
  });

  it("re-anchors a connected weekly note onto the synced grid", async () => {
    // vault.create refuses to write into a folder that doesn't exist on disk yet, and this
    // fixture carries no note folders; seedNote creates "week/" first.
    await seedNote("week/2026-W23.md", "");
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await syncWesternWeekGrid();

    await waitForFrontmatter(
      "week/2026-W23.md",
      (frontmatter) => frontmatter["journal-date"] === "2026-05-31",
      "weekly note was not re-anchored onto the week grid that arrived from sync",
    );
  });

  it("keeps the note registered in the journal index after the synced change", async () => {
    await seedNote("week/2026-W23.md", NAV_FENCE);
    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-06-01" });

    await syncWesternWeekGrid();

    await waitForJournalFrontmatter("week/2026-W23.md", { journal: "weekly", date: "2026-05-31" });
    await openInReadingMode("week/2026-W23.md");
    await $(NAV_VIEW).waitForExist({
      timeoutMsg: "note dropped out of the journal index after the grid arrived from sync",
    });
    await expect($(NAV_NOT_CONNECTED)).not.toExist();
  });
});
