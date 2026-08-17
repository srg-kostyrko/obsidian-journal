import { browser, expect } from "@wdio/globals";

import { frontmatterOf, seedNote, waitForJournalFrontmatter } from "../support/vault.js";

// A note that appears in a running vault — Obsidian Sync delivering it to a second device is the
// real case — reaches auto-attach through "created", which fires before metadataCache has parsed
// it. Every check auto-attach makes therefore read empty: the index had no entry, the note's own
// claim was invisible, and the endDate attachNote rebuilds came from an index that could not know
// it. The note was adopted and rewritten as if it were new.
//
// For a custom cycle that end date *is* the sequence — CycleService.#customNext steps from it — so
// losing one manual extension shifted every later interval. Both fixture cycles are anchored
// 2026-08-03 with a 2-week duration, and both arriving notes were extended to 2026-08-23:
//
//   kept:      2026-08-03 → 2026-08-24 → ...   (next starts the day after the extension)
//   destroyed: 2026-08-03 → 2026-08-17 → ...   (next starts on the configured duration)
//
// `sprint` writes no end date and `cadence` does, because the two failure modes differ: the field
// is deleted outright under one and silently reset to 2026-08-16 under the other.
//
// Only real Obsidian orders "created" ahead of the metadataCache parse; a fake that resolves
// metadata synchronously never reproduces the window this depends on.
//
// The shifted sequence itself is deliberately not asserted here. JournalsIndex.register returns
// early when a path's journal and anchor are unchanged, so the rewritten endDate never reaches the
// index within the session and the walk still reads the original one — the shift only appears
// after a restart rebuilds the index from the damaged frontmatter. Staging that would need the
// note to exist at boot, and a note that exists at boot never takes the "created" path this is
// about. The frontmatter above is the damage; the shift is its consequence, covered by unit tests.

const EXTENDED_END = "2026-08-23";
const SPRINT = `Sprints/2026-08-03.md`;
const CADENCE = `Cadence/2026-08-03.md`;
// Adopting this one is the barrier. It belongs to an unrelated fixed journal, so its outcome
// cannot depend on the end dates under test, and Obsidian's file events serialize in queue order —
// once auto-attach has adopted it, it has already finished with the two notes seeded before it.
const BARRIER = "Daily/2026-09-15.md";

function extendedNote(journal: string): string {
  return `---\njournal: ${journal}\njournal-date: 2026-08-03\njournal-end-date: ${EXTENDED_END}\n---\n\nExtended by hand.\n`;
}

describe("a note arriving while Obsidian runs", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-sync-arrival", plugins: ["journals"] });
    await seedNote(SPRINT, extendedNote("sprint"));
    await seedNote(CADENCE, extendedNote("cadence"));
    await seedNote(BARRIER, "");
    await waitForJournalFrontmatter(BARRIER, { journal: "daily", date: "2026-09-15" });
  });

  it("keeps a manually extended end date on a journal that writes no end date", async () => {
    const frontmatter = await frontmatterOf(SPRINT);
    expect(frontmatter?.["journal-end-date"]).toBe(EXTENDED_END);
  });

  it("keeps it on a journal that does write end dates, rather than resetting it to the duration", async () => {
    const frontmatter = await frontmatterOf(CADENCE);
    expect(frontmatter?.["journal-end-date"]).toBe(EXTENDED_END);
  });
});
