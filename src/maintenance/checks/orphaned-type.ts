import type { Finding } from "../findings";
import type { ScannedNote } from "../scanned-note";

// A type deleted in "keep" mode leaves its notelets indexed under a name no config resolves.
// They are still listed and still claimed — offering the disconnect is all a repair can do;
// re-creating a type of that name is the user's other way out, and adopts them automatically.
export function checkOrphanedType(note: ScannedNote): Finding | undefined {
  if (!note.journalExists) return undefined;
  if (note.noteletTypeName === undefined || note.noteletTypeExists !== false) return undefined;
  return {
    check: "orphaned-type",
    path: note.path,
    journalName: note.claimedJournal,
    noteletTypeName: note.noteletTypeName,
    detail: { kind: "orphaned-type", typeName: note.noteletTypeName },
    repair: { kind: "strip-claim" },
  };
}
