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
}

export interface TaskProvider {
  readonly id: string;
  // The dashboard's Tasks block renders one row per provider by reading this off
  // TaskProviderToken, so it never names a provider itself. The row owns its own enable toggle
  // and whatever opens its settings. A provider with no settings surface renders no row.
  readonly settingsRow?: Component;
  // The journal page's Tasks section renders one of these per provider, with journalName. A
  // journal can narrow a provider's rule but cannot switch the provider off, so no toggle here.
  readonly journalRow?: Component;
  start(): () => void;
  // Text is not in metadataCache, so date roles and retargetable can only be read once the line's
  // markdown exists — hydration calls this with it. The index has no dialect of its own: a
  // provider that declares no hydrateItem leaves dates and retargetable as extraction set them.
  hydrateItem?(item: TaskItem, markdown: string): TaskItem;
}

export const TaskProviderToken = createMultiToken<TaskProvider>("tasks.provider");

export interface OwnedNote {
  readonly path: VaultPath;
  readonly journalName: string;
  // journalConfig.tasks[providerId], transported verbatim — the host cannot interpret it.
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
