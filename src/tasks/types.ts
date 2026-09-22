import type { AnchorString } from "@/calendar";
import { createMultiToken, createToken } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";

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
  { readonly kind: "note"; readonly path: VaultPath } | { readonly kind: "journal"; readonly journalName: string };

export interface TaskHost {
  publish(providerId: string, scope: "all" | { path: VaultPath }, items: readonly TaskItem[]): void;
  ownedNotes(): Iterable<OwnedNote>;
  ownerOf(path: VaultPath): Option<OwnedNote>;
  onOwnedNotesChanged(callback: (change: OwnedNoteChange) => void): () => void;
}

export const TaskHostToken = createToken<TaskHost>("tasks.host");
