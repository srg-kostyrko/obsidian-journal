import { createNanoEvents } from "nanoevents";

import { AsyncResult, None, Some } from "@/infrastructure/result";
import type { Option } from "@/infrastructure/result";

import { NoteAlreadyExistsError, NoteNotFoundError } from "./errors";

import type {
  FolderNotFoundError,
  FrontmatterError,
  NoteCreateError,
  NoteDeleteError,
  NoteReadError,
  NoteRenameError,
  NoteWriteError,
  PluginDataIOError,
  WorkspaceOpenError,
} from "./errors";
import type { NotesService } from "./internal/notes-service";
import type { PluginData } from "./internal/plugin-data";
import type { TypedEmitter } from "./internal/typed-emitter";
import type { WorkspaceService } from "./internal/workspace-service";
import type { Note, NotesEvents, OpenMode, Subscribable, VaultPath, WorkspaceEvents } from "./types";

interface FakeEntry {
  content: string;
  frontmatter: Record<string, unknown>;
}

function basename(path: VaultPath): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/, "");
}

function folderOf(path: VaultPath): VaultPath {
  const index = path.lastIndexOf("/");
  return (index === -1 ? "" : path.slice(0, index)) as VaultPath;
}

function noteOf(path: VaultPath): Note {
  return { path, basename: basename(path), folder: folderOf(path) };
}

export class FakeNotesService implements Pick<
  NotesService,
  | "find"
  | "listInFolder"
  | "allMarkdownNotes"
  | "create"
  | "read"
  | "write"
  | "append"
  | "rename"
  | "delete"
  | "updateFrontmatter"
  | "events"
> {
  readonly #files = new Map<VaultPath, FakeEntry>();
  readonly #emitter: TypedEmitter<NotesEvents> = createNanoEvents();

  readonly events: Subscribable<NotesEvents> = this.#emitter;

  seed(path: VaultPath, content = "", frontmatter: Record<string, unknown> = {}): void {
    this.#files.set(path, { content, frontmatter });
  }

  find(path: VaultPath): Option<Note> {
    return this.#files.has(path) ? new Some<Note>(noteOf(path)) : new None<Note>();
  }

  listInFolder(folder: VaultPath): AsyncResult<VaultPath[], FolderNotFoundError> {
    const prefix = folder ? `${folder}/` : "";
    const matches = [...this.#files.keys()].filter((p) => p.startsWith(prefix));
    return AsyncResult.ok(matches);
  }

  allMarkdownNotes(): VaultPath[] {
    return [...this.#files.keys()];
  }

  create(path: VaultPath, content: string): AsyncResult<Note, NoteAlreadyExistsError | NoteCreateError> {
    if (this.#files.has(path)) return AsyncResult.err(new NoteAlreadyExistsError(path));
    this.#files.set(path, { content, frontmatter: {} });
    const note = noteOf(path);
    this.#emitter.emit("created", note);
    return AsyncResult.ok(note);
  }

  read(path: VaultPath): AsyncResult<string, NoteNotFoundError | NoteReadError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    return AsyncResult.ok(entry.content);
  }

  write(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    this.#files.set(path, { ...entry, content });
    return AsyncResult.ok(undefined);
  }

  append(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    this.#files.set(path, { ...entry, content: entry.content + content });
    return AsyncResult.ok(undefined);
  }

  rename(
    path: VaultPath,
    newPath: VaultPath,
  ): AsyncResult<Note, NoteNotFoundError | NoteAlreadyExistsError | NoteRenameError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    if (this.#files.has(newPath)) return AsyncResult.err(new NoteAlreadyExistsError(newPath));
    this.#files.delete(path);
    this.#files.set(newPath, entry);
    const note = noteOf(newPath);
    this.#emitter.emit("renamed", { from: path, to: newPath });
    return AsyncResult.ok(note);
  }

  delete(path: VaultPath): AsyncResult<void, NoteNotFoundError | NoteDeleteError> {
    if (!this.#files.has(path)) return AsyncResult.err(new NoteNotFoundError(path));
    this.#files.delete(path);
    this.#emitter.emit("deleted", path);
    return AsyncResult.ok(undefined);
  }

  updateFrontmatter(
    path: VaultPath,
    mutate: (fm: Record<string, unknown>) => void,
  ): AsyncResult<void, NoteNotFoundError | FrontmatterError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    const next = { ...entry.frontmatter };
    mutate(next);
    this.#files.set(path, { ...entry, frontmatter: next });
    this.#emitter.emit("metadata-changed", path);
    return AsyncResult.ok(undefined);
  }
}

export class FakeWorkspaceService implements Pick<WorkspaceService, "activeNote" | "isOpen" | "openNote" | "events"> {
  readonly #open = new Set<VaultPath>();
  readonly #emitter: TypedEmitter<WorkspaceEvents> = createNanoEvents();
  #active: Option<VaultPath> = new None<VaultPath>();

  readonly events: Subscribable<WorkspaceEvents> = this.#emitter;

  activeNote(): Option<VaultPath> {
    return this.#active;
  }

  isOpen(path: VaultPath): boolean {
    return this.#open.has(path);
  }

  openNote(path: VaultPath, _mode: OpenMode = "active"): AsyncResult<void, WorkspaceOpenError> {
    this.#open.add(path);
    this.#active = new Some<VaultPath>(path);
    this.#emitter.emit("active-note-changed", this.#active);
    return AsyncResult.ok(undefined);
  }

  setActive(path: VaultPath | null): void {
    this.#active = path === null ? new None<VaultPath>() : new Some<VaultPath>(path);
    this.#emitter.emit("active-note-changed", this.#active);
  }
}

export class FakePluginData implements Pick<PluginData, "load" | "save"> {
  #current: unknown;

  constructor(initial: unknown = undefined) {
    this.#current = initial;
  }

  load(): AsyncResult<unknown, PluginDataIOError> {
    return AsyncResult.ok(this.#current);
  }

  save(data: unknown): AsyncResult<void, PluginDataIOError> {
    this.#current = data;
    return AsyncResult.ok(undefined);
  }
}
