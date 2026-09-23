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
  // Optional the same way hydrateItem is: the settings dashboard's Tasks block renders one
  // section per registered provider by reading this field off TaskProviderToken, so it never
  // has to name a provider itself. A provider with no settings surface (none yet) renders no
  // section.
  readonly settingsSection?: Component;
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
