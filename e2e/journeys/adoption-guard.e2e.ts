import { browser, expect } from "@wdio/globals";

import { openPalette, promptChoose } from "../support/commands.js";
import {
  activeNotePath,
  noteExists,
  seedNote,
  waitForActiveNote,
  waitForJournalFrontmatter,
} from "../support/vault.js";

// The boot walk (onLayoutReady -> VaultSubscriptionService#rebuild -> FrontmatterService#parseEntry)
// reads the real metadataCache and rejects any note whose stored journal-date is not the period's
// canonical anchor: for a monthly journal, only the first of the month qualifies. The orphan note
// carries journal-date: 2024-06-15, which is not a month anchor (2024-06-01 is), so parseEntry
// returns Option.none() and the note is never registered in JournalsIndex.
//
// The observable: "Open previous log" is a previous_available command targeting the log journal.
// previous_available calls JournalsIndex#findNearestExisting, which only scans registered entries.
// Without the guard, 2024-06-15 (orphan anchor, closer to today 2026-07-09) would be the nearest
// previous and navigation would open 2024-06.md. With the guard, only 2024-05-01 (legit) is
// registered, so navigation opens 2024-05.md.
//
// Discriminating property: if the guard were deleted, findNearestExisting would return 2024-06-15
// (nearer to today than 2024-05-01), OpenDateFlow would open 2024-06.md, and waitForActiveNote(
// "2024-05.md") would time out. The assertion is a genuine regression gate.
//
// DI smoke check: Task 3 added CycleService + JournalsRepository injections to
// VaultSubscriptionService. A boot-time dependency cycle would abort onload (white screen / plugin
// absent) and would surface here as a timeout or palette-not-found failure before either it() runs.

const LEGIT = "2024-05.md";
const ORPHAN = "2024-06.md";

function monthNote(date: string): string {
  return `---\njournal: log\njournal-date: ${date}\n---\n`;
}

describe("adoption anchor guard", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-adoption", plugins: ["journals"] });
    // Seed after boot so the metadata-changed event fires and #scan runs synchronously,
    // ensuring both notes are in the index before the test invokes the command.
    await seedNote(LEGIT, monthNote("2024-05-01"));
    await seedNote(ORPHAN, monthNote("2024-06-15"));
    // waitForJournalFrontmatter on LEGIT confirms metadataCache has parsed it and #scan has run.
    // ORPHAN's #scan call also ran (rejected by the guard), so the index state is settled.
    await waitForJournalFrontmatter(LEGIT, { journal: "log", date: "2024-05-01" });
  });

  it("keeps both seeded notes on disk (the guard never mutates files)", async () => {
    expect(await noteExists(LEGIT)).toBe(true);
    expect(await noteExists(ORPHAN)).toBe(true);
  });

  it("does not open the off-sequence orphan from previous-available navigation", async () => {
    await openPalette();
    await promptChoose("Open previous log");

    await waitForActiveNote(LEGIT);
    expect(await activeNotePath()).not.toBe(ORPHAN);
  });
});
