import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import type { Finding } from "./findings";
import type { ScannedNote } from "./scanned-note";

function keyOf(journalName: string, anchor: AnchorString): string {
  return `${journalName}::${anchor}`;
}

// A repair's target collides with wherever the vault will be *after* the repairs, not where it
// is now — and that collision does not exist until the repair is planned, so no ordering of
// writes can avoid it. Compute it here and withdraw every repair that contests an anchor.
export function gateCollisions(notes: readonly ScannedNote[], findings: readonly Finding[]): readonly Finding[] {
  const rewriteByPath = new Map<VaultPath, AnchorString>();
  for (const finding of findings) {
    if (finding.repair.kind === "rewrite") rewriteByPath.set(finding.path, finding.repair.anchor);
  }

  // Each bucket carries its own anchor rather than parsing it back out of the composite key:
  // a journal name may contain the separator, and a mis-split would silently mis-group.
  const byAnchor = new Map<string, { anchor: AnchorString; notes: ScannedNote[] }>();
  for (const note of notes) {
    if (!note.journalExists) continue;
    const target =
      rewriteByPath.get(note.path) ??
      (note.storedAnchor !== undefined && note.storedAnchor === note.canonicalAnchor ? note.storedAnchor : undefined);
    if (target === undefined) continue;
    const key = keyOf(note.claimedJournal, target);
    const bucket = byAnchor.get(key);
    if (bucket) bucket.notes.push(note);
    else byAnchor.set(key, { anchor: target, notes: [note] });
  }

  const contested = new Map<VaultPath, { note: ScannedNote; anchor: AnchorString }>();
  for (const bucket of byAnchor.values()) {
    if (bucket.notes.length < 2) continue;
    for (const note of bucket.notes) contested.set(note.path, { note, anchor: bucket.anchor });
  }
  if (contested.size === 0) return findings;

  const gated: Finding[] = findings.map((finding) =>
    finding.repair.kind === "rewrite" && contested.has(finding.path)
      ? { ...finding, repair: { kind: "undecidable", reason: "anchor-contested" } }
      : finding,
  );

  for (const [path, { note, anchor }] of contested) {
    gated.push({
      check: "duplicate-anchor",
      path,
      journalName: note.claimedJournal,
      detail: { kind: "duplicate", anchor, size: note.size, mtime: note.mtime },
      repair: { kind: "undecidable", reason: "needs-choice" },
    });
  }
  return gated;
}
