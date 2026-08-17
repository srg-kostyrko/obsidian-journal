import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { SettingsService } from "@/settings";
import { pendingNoteMigrationSlice } from "@/settings/legacy/pending-note-migration";
import type { PendingNoteMigration } from "@/settings/legacy/pending-note-migration";

import { checkRejectedAnchor } from "./checks/rejected-anchor";
import { checkStaleRange } from "./checks/stale-range";
import { ScannedNoteResolver } from "./scanned-note";

import type { Finding, ScanReport, UnreadableNote } from "./findings";
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

export function pendingOldIdsOf(markers: readonly PendingNoteMigration[]): Set<string> {
  const ids = new Set<string>();
  for (const marker of markers) {
    if (marker.kind !== "week-anchor") ids.add(marker.oldJournalId);
  }
  return ids;
}

// An inventory, not a defect list. Keep-mode deletion deliberately leaves these keys behind and
// records nothing, so nothing in the data tells it apart from a failed migration — and a note
// still keyed by a legacy id is excluded outright, because stripping that key strands its
// legacy frontmatter forever (the same reason auto-attach refuses to adopt one).
export function orphanFindings(notes: readonly ScannedNote[], pendingOldIds: ReadonlySet<string>): readonly Finding[] {
  const out: Finding[] = [];
  for (const note of notes) {
    if (note.journalExists) continue;
    if (pendingOldIds.has(note.claimedJournal)) continue;
    out.push({
      check: "orphaned-claim",
      path: note.path,
      journalName: note.claimedJournal,
      detail: { kind: "orphaned" },
      repair: { kind: "undecidable", reason: "needs-choice" },
    });
  }
  return out;
}

export class ScanService {
  readonly #notes = inject(NotesService);
  readonly #index = inject(JournalsIndex);
  readonly #resolver = inject(ScannedNoteResolver);
  readonly #pending = inject(SettingsService).getSlice(pendingNoteMigrationSlice);

  // Before the index is ready every note reads as stranded, so the walk waits rather than reporting on an empty index.
  async scan(): Promise<ScanReport> {
    await this.#index.whenReady();

    const resolved: ScannedNote[] = [];
    const unreadable: UnreadableNote[] = [];
    let unparsed = 0;

    for (const path of this.#notes.allMarkdownNotes()) {
      const outcome = this.#resolver.resolve(path);
      switch (outcome.kind) {
        case "resolved": {
          resolved.push(outcome.note);
          break;
        }
        case "unparsed": {
          unparsed += 1;
          break;
        }
        case "unreadable": {
          unreadable.push({ path, message: outcome.message });
          break;
        }
        default: {
          break;
        }
      }
    }

    const classified: Finding[] = [];
    for (const note of resolved) {
      const rejected = checkRejectedAnchor(note);
      if (rejected) classified.push(rejected);
      const stale = checkStaleRange(note);
      if (stale) classified.push(stale);
    }

    const pendingOldIds = pendingOldIdsOf(this.#pending.state);
    const findings = [...gateCollisions(resolved, classified), ...orphanFindings(resolved, pendingOldIds)];

    return {
      findings,
      analysed: resolved.length,
      unreadable,
      unparsed,
      pendingMigration: this.#pending.state.length > 0,
    };
  }
}
