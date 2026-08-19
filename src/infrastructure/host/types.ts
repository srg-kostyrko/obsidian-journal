import type { Option } from "@/infrastructure/result";

export type VaultPath = string & { readonly __brand: "VaultPath" };

export interface Note {
  readonly path: VaultPath;
  readonly basename: string;
  readonly folder: VaultPath;
  readonly size: number;
  readonly mtime: number;
}

export type OpenMode = "active" | "tab" | "split" | "window";

export interface NotesEvents {
  created: (note: Note) => void;
  renamed: (event: { from: VaultPath; to: VaultPath }) => void;
  deleted: (path: VaultPath) => void;
  // The parse changed. For "the bytes changed", use `modified`.
  "metadata-changed": (path: VaultPath) => void;
  // The bytes changed. Fires before metadata-changed and without its parse.
  modified: (path: VaultPath) => void;
}

export interface WorkspaceEvents {
  "active-note-changed": (path: Option<VaultPath>) => void;
}

export interface NoteTask {
  readonly completed: boolean;
}

export interface VaultProperty {
  readonly name: string;
  readonly type: string;
}

export interface NoteMetadata {
  readonly title: string;
  readonly tags: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
  readonly tasks: readonly NoteTask[];
}

export interface NoteSize {
  readonly words: number;
  readonly characters: number;
}

// A menu entry a feature contributes to a host-built context menu. The host stays ignorant of
// what the entry means — features own the title, the icon and what clicking it does.
export interface MenuItemSpec {
  readonly title: string;
  readonly icon: string;
  readonly onClick: () => void;
}
