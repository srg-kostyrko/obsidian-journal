import type { Finding } from "../findings";
import type { ScannedNote } from "../scanned-note";

// A rejected note's rewrite recomputes the range in the same write, so it is never both.
export function checkStaleRange(note: ScannedNote): Finding | undefined {
  if (!note.journalExists) return undefined;
  // A notelet carries no start or end key, so there is no range to be stale — reading its absent
  // keys would report a zero-length range on every one of them.
  if (note.noteletTypeName !== undefined) return undefined;
  const settled = note.storedAnchor;
  if (settled === undefined || note.canonicalAnchor !== settled) return undefined;

  const base = { check: "stale-range", path: note.path, journalName: note.claimedJournal } as const;

  if (!note.isDayJournal && note.storedEnd === settled) {
    return {
      ...base,
      detail: { kind: "zero-length-range", anchor: settled },
      repair: { kind: "rewrite", anchor: settled },
    };
  }

  if (note.storedStart !== undefined && note.expectedStart !== undefined && note.storedStart !== note.expectedStart) {
    return {
      ...base,
      detail: {
        kind: "start-mismatch",
        anchor: settled,
        storedStart: note.storedStart,
        expectedStart: note.expectedStart,
      },
      repair: { kind: "rewrite", anchor: settled },
    };
  }

  return undefined;
}
