import { browser, expect } from "@wdio/globals";

import { openPalette, promptChoose } from "../support/commands.js";
import { frontmatterOf, openNote, seedNote, waitForActiveNote, waitForJournalFrontmatter } from "../support/vault.js";

// A previous_available command opens the nearest EXISTING earlier note (never creating one).
// With context open_note the reference is the open journal note's date, so seeding two daily
// notes a day apart and opening the later one must navigate past the un-created gap day.

const OPEN_LAST_AVAILABLE = "Open last available day's note";

const EARLIER = "day/2030-09-10.md";
const GAP = "day/2030-09-11.md";
const LATER = "day/2030-09-12.md";

function dailyNote(anchor: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\n---\n`;
}

describe("open last available command", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
    await seedNote(EARLIER, dailyNote("2030-09-10"));
    await seedNote(LATER, dailyNote("2030-09-12"));
    await waitForJournalFrontmatter(EARLIER, { journal: "daily", date: "2030-09-10" });
    await waitForJournalFrontmatter(LATER, { journal: "daily", date: "2030-09-12" });
  });

  it("opens the nearest earlier existing note, skipping the un-created gap day", async () => {
    await openNote(LATER);
    await openPalette();
    await promptChoose(OPEN_LAST_AVAILABLE);
    await waitForActiveNote(EARLIER);
  });

  it("never creates the un-created gap day", async () => {
    await openNote(LATER);
    await openPalette();
    await promptChoose(OPEN_LAST_AVAILABLE);
    await waitForActiveNote(EARLIER);
    expect(await frontmatterOf(GAP)).toBeNull();
  });
});
