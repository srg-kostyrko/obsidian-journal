import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

export interface JournalEntry {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
}

export interface JournalsIndexEvents {
  entryChanged: (event: { entry: JournalEntry; kind: "added" | "removed" }) => void;
  journalDirty: (event: { journalName: string }) => void;
}
