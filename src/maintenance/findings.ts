import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

export type CheckKey = "rejected-anchor" | "stale-range" | "duplicate-anchor" | "orphaned-claim";

export type UndecidableReason = "path-not-invertible" | "path-and-date-disagree" | "anchor-contested" | "needs-choice";

export type Repair =
  | { kind: "rewrite"; anchor: AnchorString }
  | { kind: "strip-claim" }
  | { kind: "undecidable"; reason: UndecidableReason };

// Data, not prose: only the UI can localize, and only the UI knows whether it is describing
// an intention or an outcome. Mirrors BulkLogAction in BulkAddService.
export type FindingDetail =
  | { kind: "corroborated"; from: AnchorString; to: AnchorString }
  | { kind: "date-only"; from: AnchorString; to: AnchorString }
  | { kind: "no-usable-date"; raw: unknown; to: AnchorString }
  | { kind: "path-overrides-date"; pathAnchor: AnchorString; dateAnchor: AnchorString }
  | { kind: "unreadable"; raw: unknown }
  | { kind: "zero-length-range"; anchor: AnchorString }
  | { kind: "start-mismatch"; anchor: AnchorString; storedStart: string; expectedStart: AnchorString }
  | { kind: "duplicate"; anchor: AnchorString; size: number; mtime: number }
  | { kind: "orphaned" };

export interface Finding {
  readonly check: CheckKey;
  readonly path: VaultPath;
  readonly journalName: string;
  readonly detail: FindingDetail;
  readonly repair: Repair;
}

// What the user chose to do, which is not always what the finding suggested: a duplicate group
// suggests `undecidable` and yields strip-claims once the user picks a keeper.
export interface RepairAction {
  readonly path: VaultPath;
  readonly journalName: string;
  readonly repair: Repair;
}

export interface UnreadableNote {
  readonly path: VaultPath;
  readonly message: string;
}

export interface ScanReport {
  readonly findings: readonly Finding[];
  readonly analysed: number;
  readonly unreadable: readonly UnreadableNote[];
  readonly unparsed: number;
  readonly pendingMigration: boolean;
}
