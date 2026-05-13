import type { Option } from "@/infrastructure/result";

export type VaultPath = string & { readonly __brand: "VaultPath" };

export interface Note {
  readonly path: VaultPath;
  readonly basename: string;
  readonly folder: VaultPath;
}

export type OpenMode = "active" | "tab" | "split" | "window";

export interface Subscribable<E extends object> {
  on<K extends keyof E & string>(
    event: K,
    callback: E[K] extends (...arguments_: infer A) => void ? (...arguments_: A) => void : never,
  ): () => void;
}

export interface NotesEvents {
  created: (note: Note) => void;
  renamed: (event: { from: VaultPath; to: VaultPath }) => void;
  deleted: (path: VaultPath) => void;
  "metadata-changed": (path: VaultPath) => void;
}

export interface WorkspaceEvents {
  "active-note-changed": (path: Option<VaultPath>) => void;
}
