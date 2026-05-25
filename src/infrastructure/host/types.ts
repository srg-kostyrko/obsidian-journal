import type { Option } from "@/infrastructure/result";

export type VaultPath = string & { readonly __brand: "VaultPath" };

export interface Note {
  readonly path: VaultPath;
  readonly basename: string;
  readonly folder: VaultPath;
}

export type OpenMode = "active" | "tab" | "split" | "window";

export interface NotesEvents {
  created: (note: Note) => void;
  renamed: (event: { from: VaultPath; to: VaultPath }) => void;
  deleted: (path: VaultPath) => void;
  "metadata-changed": (path: VaultPath) => void;
}

export interface WorkspaceEvents {
  "active-note-changed": (path: Option<VaultPath>) => void;
}

export interface NoteTask {
  readonly completed: boolean;
}

export interface NoteMetadata {
  readonly title: string;
  readonly tags: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
  readonly tasks: readonly NoteTask[];
}
