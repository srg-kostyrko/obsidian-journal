import type { JournalConfig } from "@/journals";
import type { ShelfConfig } from "@/shelves";

// Deliberately its own primitive, not nav's `resolveLinkCandidates`
// (`src/code-blocks/nav/link-targets.ts`). CLAUDE.md documents three nav consumers whose
// off-shelf fallbacks differ on purpose, for nav-link reasons, and says not to fuse them behind
// a shared shelf-mates helper — reusing that helper here would couple a rollup's scope to
// whatever a future nav-link change decides, for a reason that has nothing to do with a rollup.
// A rollup answers its own question, "which journals' periods roll up into this one", which
// happens to want the same shape today (the owning shelf's journals, host included, or every
// journal when the host is on no shelf) — so it gets its own three-line function instead.
export function taskRollupScope(
  hostJournalName: string,
  allJournals: readonly JournalConfig[],
  allShelves: readonly ShelfConfig[],
): readonly string[] {
  const owning = allShelves.find((shelf) => shelf.journals.includes(hostJournalName));
  if (owning === undefined) return allJournals.map((journal) => journal.name);
  return allJournals.filter((journal) => owning.journals.includes(journal.name)).map((journal) => journal.name);
}
