import { browser, expect } from "@wdio/globals";

import { openPalette, promptChoose } from "../support/commands.js";
import { activeNotePath, seedNote, waitForActiveNote, waitForJournalFrontmatter } from "../support/vault.js";

// Custom-cycle second pass: #reconcileCustomJournals in VaultSubscriptionService runs after the full
// boot walk. It calls CycleService.intervalsInRange over all registered anchors for each custom
// journal and unregisters any anchor not in the valid set.
//
// Sprint journal: every=week, duration=2, anchorDate=2024-01-01.
// On-grid anchors: 2024-01-01, 2024-01-15, 2024-01-29, ...
// nameTemplate={{date}}, dateFormat=YYYY-MM-DD (no folder) → canonical paths are YYYY-MM-DD.md.
//
// LEGIT = 2024-01-15: a real 2-week anchor → 2024-01-15.md. Stays in the index.
// ORPHAN = 2024-01-22: falls inside the interval [2024-01-15, 2024-01-28]; only valid anchor in
// range is 2024-01-15. #reconcileCustomJournals drops 2024-01-22 from the index.
//
// Discrimination: without the reconciliation, 2024-01-22 remains registered. 2024-01-22 > 2024-01-15,
// so findNearestExisting("previous") from today (2026-07-09) returns 2024-01-22 (nearer to today).
// Navigation opens 2024-01-22.md. waitForActiveNote(LEGIT) times out — a genuine regression gate.
//
// On the metadata-changed path (seeded post-boot), #scan runs with reconcileCustom=true and calls
// #reconcileEntry, which uses CycleService.isCanonicalAnchor. For custom journals, isCanonicalAnchor
// reads the index (extension chain), so it's order-dependent — seeding ORPHAN before LEGIT ensures
// the LEGIT barrier below covers ORPHAN's rejection.

const LEGIT = "2024-01-15.md";
const ORPHAN = "2024-01-22.md";

function sprintNote(date: string): string {
  return `---\njournal: sprint\njournal-date: ${date}\n---\n`;
}

describe("adoption anchor guard — custom interval", () => {
  before(async () => {
    await browser.reloadObsidian({
      vault: "./e2e/fixtures/e2e-adoption-custom",
      plugins: ["journals"],
    });
    // Seed ORPHAN before LEGIT so that once LEGIT's metadata-changed fires (the barrier below),
    // ORPHAN's earlier-queued #scan (and its reconcileCustom rejection) has already run.
    // Obsidian's metadata events serialize in queue order, so the LEGIT barrier is sufficient.
    await seedNote(ORPHAN, sprintNote("2024-01-22"));
    await seedNote(LEGIT, sprintNote("2024-01-15"));
    await waitForJournalFrontmatter(LEGIT, { journal: "sprint", date: "2024-01-15" });
  });

  it("keeps the on-grid custom note reachable", async () => {
    await openPalette();
    await promptChoose("Open previous sprint");

    await waitForActiveNote(LEGIT);
    expect(await activeNotePath()).toBe(LEGIT);
  });

  it("does not open the off-sequence custom orphan", async () => {
    expect(await activeNotePath()).not.toBe(ORPHAN);
  });
});
