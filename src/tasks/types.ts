import type { AnchorString } from "@/calendar";
import { createMultiToken, createToken } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";

import type { Component } from "vue";

export type TaskStatus = "todo" | "done" | "in-progress" | "cancelled" | "on-hold" | "non-task" | "rolled";
export type TaskDateRole = "due" | "scheduled" | "start" | "done" | "created";
export type TaskRelation = "containment" | "date";

export interface TaskCapabilities {
  readonly movable: boolean;
  readonly stampable: boolean;
  readonly retargetable: boolean;
}

export type TaskDisplay =
  | {
      readonly kind: "line";
      readonly path: VaultPath;
      readonly line: number;
      readonly endLine: number;
      readonly parentLine: number | null;
      readonly markdown: string | null;
    }
  | { readonly kind: "note"; readonly path: VaultPath; readonly title: string };

export interface TaskItem {
  readonly provider: string;
  readonly key: string;
  readonly path: VaultPath;
  readonly status: TaskStatus;
  readonly relations: readonly TaskRelation[];
  readonly capabilities: TaskCapabilities;
  readonly display: TaskDisplay;
  readonly dates: Partial<Record<TaskDateRole, AnchorString>>;
  // What surfaces filter a whole-note item on, captured at publish. Were they read live at query
  // time, an edit to them would republish an equal item, the index would not bump, and no filter
  // would recompute.
  readonly facts?: TaskFacts;
}

export interface TaskFacts {
  readonly frontmatterTags: readonly string[];
  // Only the properties some journal's visibility rule names: a snapshot of the whole frontmatter
  // would make every unrelated edit (TaskNotes rewrites dateModified on each one) a changed item.
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface TaskProvider {
  readonly id: string;
  // The dashboard's Tasks block renders one row per provider by reading this off
  // TaskProviderToken, so it never names a provider itself. The row owns its own enable toggle
  // and whatever opens its settings. A provider with no settings surface renders no row.
  readonly settingsRow?: Component;
  // The journal page's Tasks section renders one of these per provider, with journalName. A
  // journal narrows what a provider shows it (note-property can show None), but the provider itself
  // stays on or off globally, so no enable toggle here.
  readonly journalRow?: Component;
  start(): () => void;
  // Whether `journalName` shows this item. Called from reactive effects, so an implementation reads
  // the journal's config synchronously for the effect to track it. Absent means every journal shows all.
  admits?(item: TaskItem, journalName: string): boolean;
}

export const TaskProviderToken = createMultiToken<TaskProvider>("tasks.provider");

export interface OwnedNote {
  readonly path: VaultPath;
  readonly journalName: string;
  // journalConfig.tasks.providers[providerId], transported verbatim — the host cannot interpret it.
  readonly rule: unknown;
}

export type OwnedNoteChange =
  | { readonly kind: "note"; readonly path: VaultPath }
  | { readonly kind: "journal"; readonly journalName: string }
  // Every owned note at once. The narrower kinds name what changed; this one cannot, because the
  // notes it concerns are already gone from the index by the time it is emitted.
  | { readonly kind: "all" };

export interface TaskHost {
  publish(providerId: string, scope: "all" | { path: VaultPath }, items: readonly TaskItem[]): void;
  // journalName narrows the walk to one journal's notes. A journal's rule changing refills only
  // that journal, and without the narrowing that refill is a walk of the whole owned set.
  ownedNotes(providerId: string, journalName?: string): Iterable<OwnedNote>;
  ownerOf(path: VaultPath, providerId: string): Option<OwnedNote>;
  onOwnedNotesChanged(callback: (change: OwnedNoteChange) => void): () => void;
}

export const TaskHostToken = createToken<TaskHost>("tasks.host");
