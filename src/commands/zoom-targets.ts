import { nominalSpanDays } from "@/journals";
import type { JournalConfig } from "@/journals";
import type { ShelfConfig } from "@/shelves";

// A journal on a shelf zooms among its shelf-mates; one on no shelf zooms across every journal,
// the same scope a write-type navigation row resolves to. The rule is restated here rather than
// shared with the nav consumers, whose off-shelf fallbacks deliberately differ from each other.
function scopeFor(
  active: JournalConfig,
  allJournals: readonly JournalConfig[],
  shelves: readonly ShelfConfig[],
): readonly JournalConfig[] {
  const owning = shelves.find((shelf) => shelf.journals.includes(active.name));
  if (!owning) return allJournals;
  return allJournals.filter((journal) => owning.journals.includes(journal.name));
}

/**
 * The journals one granularity longer or shorter than the active one, within its scope.
 * Journals of equal span answer together — the caller disambiguates.
 */
export function zoomTargets(
  direction: "longer" | "shorter",
  active: JournalConfig,
  allJournals: readonly JournalConfig[],
  shelves: readonly ShelfConfig[],
): readonly string[] {
  const from = nominalSpanDays(active.write);
  const beyond = scopeFor(active, allJournals, shelves).filter((journal) =>
    direction === "longer" ? nominalSpanDays(journal.write) > from : nominalSpanDays(journal.write) < from,
  );
  const spans = beyond.map((journal) => nominalSpanDays(journal.write));
  const nearest = direction === "longer" ? Math.min(...spans) : Math.max(...spans);
  return beyond.filter((journal) => nominalSpanDays(journal.write) === nearest).map((journal) => journal.name);
}
