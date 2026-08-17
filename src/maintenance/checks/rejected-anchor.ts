import type { Finding } from "../findings";
import type { ScannedNote } from "../scanned-note";

// The path wins whenever it is applied, and the reason is worth keeping: nothing in the damage
// path that strands these notes renames a file, so the path is the one artifact it never touched.
export function checkRejectedAnchor(note: ScannedNote): Finding | undefined {
  if (!note.journalExists) return undefined;

  const base = { check: "rejected-anchor", path: note.path, journalName: note.claimedJournal } as const;

  if (note.storedAnchor === undefined) {
    if (note.pathAnchor === undefined) {
      return {
        ...base,
        detail: { kind: "unreadable", raw: note.rawDate },
        repair: { kind: "undecidable", reason: "path-not-invertible" },
      };
    }
    return {
      ...base,
      detail: { kind: "no-usable-date", raw: note.rawDate, to: note.pathAnchor },
      repair: { kind: "rewrite", anchor: note.pathAnchor },
    };
  }

  if (note.canonicalAnchor === undefined) {
    return {
      ...base,
      detail: { kind: "unreadable", raw: note.rawDate },
      repair: { kind: "undecidable", reason: "path-not-invertible" },
    };
  }
  if (note.canonicalAnchor === note.storedAnchor) return undefined;

  if (note.pathAnchor === undefined) {
    return {
      ...base,
      detail: { kind: "date-only", from: note.storedAnchor, to: note.canonicalAnchor },
      repair: { kind: "rewrite", anchor: note.canonicalAnchor },
    };
  }
  if (note.pathAnchor === note.canonicalAnchor) {
    return {
      ...base,
      detail: { kind: "corroborated", from: note.storedAnchor, to: note.pathAnchor },
      repair: { kind: "rewrite", anchor: note.pathAnchor },
    };
  }
  return {
    ...base,
    detail: { kind: "path-overrides-date", pathAnchor: note.pathAnchor, dateAnchor: note.canonicalAnchor },
    repair: { kind: "undecidable", reason: "path-and-date-disagree" },
  };
}
