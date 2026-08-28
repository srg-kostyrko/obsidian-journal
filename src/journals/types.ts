import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import type { PromptAnswer } from "./prompts/config";

export interface JournalEntry {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
  readonly answers?: Readonly<Record<string, PromptAnswer>>;
}

export interface JournalsIndexEvents {
  entryChanged: (event: { entry: JournalEntry; kind: "added" | "removed" }) => void;
  journalDirty: (event: { journalName: string }) => void;
}

export interface JournalMetadata {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
  readonly answers?: Readonly<Record<string, PromptAnswer>>;
}
