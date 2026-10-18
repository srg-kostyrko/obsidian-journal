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

/** The metadata union's notelet arm. `kind` is the only field a period's metadata never carries. */
export function isNoteletMetadata(metadata: JournalMetadata | NoteletMetadata): metadata is NoteletMetadata {
  return "kind" in metadata;
}

// The union's period arm, for a `.flatMap` chain that has ruled notelets out.
export function periodEntryOf(entry: IndexedNote): Option<JournalEntry> {
  return isNotelet(entry) ? Option.none() : Option.some(entry);
}

/** Where a registration comes from; the index turns it into the added event's reason. */
export type EntryOrigin = "walk" | "live" | "created" | "preview";

export type EntryAddedReason = "indexed" | "created" | "appeared" | "changed" | "moved" | "preview";
export type EntryRemovedReason = "deleted" | "moved" | "changed" | "unindexed" | "preview";

export type EntryChangedEvent =
  | { entry: IndexedNote; kind: "added"; reason: EntryAddedReason; canonical: boolean }
  | { entry: IndexedNote; kind: "removed"; reason: EntryRemovedReason };

export interface JournalsIndexEvents {
  entryChanged: (event: EntryChangedEvent) => void;
  journalDirty: (event: { journalName: string }) => void;
}

export interface JournalMetadata {
  readonly journalName: string;
  readonly anchor: AnchorString;
  readonly endDate?: AnchorString;
  readonly numbers?: Readonly<Record<string, number>>;
  readonly answers?: Readonly<Record<string, PromptAnswer>>;
}
