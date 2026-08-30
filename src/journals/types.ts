import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import type { TypeId } from "./notelets/config";
import type { PromptAnswer } from "./prompts/config";

export interface JournalEntry {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
  readonly answers?: Readonly<Record<string, PromptAnswer>>;
}

export interface NoteletEntry {
  readonly kind: "notelet";
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly path: VaultPath;
  readonly typeName: string;
  readonly typeId: TypeId | null;
  readonly counter?: number;
  readonly answers?: Readonly<Record<string, PromptAnswer>>;
}

export type IndexedNote = JournalEntry | NoteletEntry;

export interface NoteletMetadata {
  readonly kind: "notelet";
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly typeId: TypeId;
  readonly counter?: number;
  readonly answers?: Readonly<Record<string, PromptAnswer>>;
}

export function isNotelet(entry: IndexedNote): entry is NoteletEntry {
  return "kind" in entry;
}

// The union's period arm, for a `.flatMap` chain that has ruled notelets out.
export function periodEntryOf(entry: IndexedNote): Option<JournalEntry> {
  return isNotelet(entry) ? Option.none() : Option.some(entry);
}

export interface JournalsIndexEvents {
  entryChanged: (event: { entry: IndexedNote; kind: "added" | "removed" }) => void;
  journalDirty: (event: { journalName: string }) => void;
}

export interface JournalMetadata {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
  readonly answers?: Readonly<Record<string, PromptAnswer>>;
}
