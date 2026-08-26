import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";

import type { ScannedNote } from "./scanned-note";

export function buildScannedNote(overrides: Partial<ScannedNote> = {}): ScannedNote {
  return {
    path: "W03.md" as VaultPath,
    claimedJournal: "weekly",
    journalExists: true,
    isDayJournal: false,
    size: 10,
    mtime: 1,
    rawDate: "2026-01-12",
    storedAnchor: anchor("2026-01-12"),
    canonicalAnchor: anchor("2026-01-12"),
    expectedStart: anchor("2026-01-12"),
    ...overrides,
  };
}
