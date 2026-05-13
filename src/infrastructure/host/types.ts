import type { Option } from "@/infrastructure/result";

import type { Emitter } from "nanoevents";

type EventsMap = Record<string, (...eventData: unknown[]) => void>;

export type VaultPath = string & { readonly __brand: "VaultPath" };

export interface Note {
  readonly path: VaultPath;
  readonly basename: string;
  readonly folder: VaultPath;
}

export type OpenMode = "active" | "tab" | "split" | "window";

export type Subscribable<E extends EventsMap> = Pick<Emitter<E>, "on">;

export interface NotesEvents {
  created: (note: Note) => void;
  renamed: (event: { from: VaultPath; to: VaultPath }) => void;
  deleted: (path: VaultPath) => void;
  "metadata-changed": (path: VaultPath) => void;
}

export interface WorkspaceEvents {
  "active-note-changed": (path: Option<VaultPath>) => void;
}
