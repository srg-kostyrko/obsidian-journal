import type { VaultPath } from "./types";

export abstract class HostError extends Error {
  abstract readonly kind: string;
}

export class NoteNotFoundError extends HostError {
  readonly kind = "note-not-found" as const;
  constructor(readonly path: VaultPath) {
    super(`Note not found: ${path}`);
    this.name = "NoteNotFoundError";
  }
}

export class NoteAlreadyExistsError extends HostError {
  readonly kind = "note-already-exists" as const;
  constructor(readonly path: VaultPath) {
    super(`Note already exists: ${path}`);
    this.name = "NoteAlreadyExistsError";
  }
}

export class NoteReadError extends HostError {
  readonly kind = "note-read-failed" as const;
  constructor(
    readonly path: VaultPath,
    override readonly cause: unknown,
  ) {
    super(`Failed to read note: ${path}`);
    this.name = "NoteReadError";
  }
}

export class NoteWriteError extends HostError {
  readonly kind = "note-write-failed" as const;
  constructor(
    readonly path: VaultPath,
    override readonly cause: unknown,
  ) {
    super(`Failed to write note: ${path}`);
    this.name = "NoteWriteError";
  }
}

export class NoteCreateError extends HostError {
  readonly kind = "note-create-failed" as const;
  constructor(
    readonly path: VaultPath,
    override readonly cause: unknown,
  ) {
    super(`Failed to create note: ${path}`);
    this.name = "NoteCreateError";
  }
}

export class NoteRenameError extends HostError {
  readonly kind = "note-rename-failed" as const;
  constructor(
    readonly from: VaultPath,
    readonly to: VaultPath,
    override readonly cause: unknown,
  ) {
    super(`Failed to rename note: ${from} -> ${to}`);
    this.name = "NoteRenameError";
  }
}

export class NoteDeleteError extends HostError {
  readonly kind = "note-delete-failed" as const;
  constructor(
    readonly path: VaultPath,
    override readonly cause: unknown,
  ) {
    super(`Failed to delete note: ${path}`);
    this.name = "NoteDeleteError";
  }
}

export class FrontmatterError extends HostError {
  readonly kind = "frontmatter-failed" as const;
  constructor(
    readonly path: VaultPath,
    override readonly cause: unknown,
  ) {
    super(`Failed to update frontmatter: ${path}`);
    this.name = "FrontmatterError";
  }
}

export class FolderNotFoundError extends HostError {
  readonly kind = "folder-not-found" as const;
  constructor(readonly path: VaultPath) {
    super(`Folder not found: ${path}`);
    this.name = "FolderNotFoundError";
  }
}

export class WorkspaceOpenError extends HostError {
  readonly kind = "workspace-open-failed" as const;
  constructor(
    readonly path: VaultPath,
    override readonly cause: unknown,
  ) {
    super(`Failed to open note in workspace: ${path}`);
    this.name = "WorkspaceOpenError";
  }
}

export class PluginDataIOError extends HostError {
  readonly kind = "plugin-data-io-failed" as const;
  constructor(
    readonly operation: "load" | "save",
    override readonly cause: unknown,
  ) {
    super(`Plugin data ${operation} failed`);
    this.name = "PluginDataIOError";
  }
}
