import { createNanoEvents } from "nanoevents";

import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { AsyncResult, None, Some } from "@/infrastructure/result";
import type { Option } from "@/infrastructure/result";

import { FolderNotFoundError, NoteAlreadyExistsError, NoteNotFoundError } from "./errors";

import type {
  FrontmatterError,
  NoteCreateError,
  NoteDeleteError,
  NoteReadError,
  NoteRenameError,
  NoteWriteError,
  PluginDataIOError,
  WorkspaceOpenError,
} from "./errors";
import type { NoteMetadataService } from "./internal/note-metadata-service";
import type { NotesService } from "./internal/notes-service";
import type { NoticeService } from "./internal/notice-service";
import type { PluginData } from "./internal/plugin-data";
import type { TemplaterService } from "./internal/templater-service";
import type { WorkspaceService } from "./internal/workspace-service";
import type { Note, NoteMetadata, NotesEvents, OpenMode, VaultPath, WorkspaceEvents } from "./types";

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
  | "listFolders"
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
  readonly #folders = new Set<VaultPath>(["" as VaultPath]);
  readonly #emitter: TypedEmitter<NotesEvents> = createNanoEvents();

  readonly events: Subscribable<NotesEvents> = this.#emitter;

  seed(path: VaultPath, content = "", frontmatter: Record<string, unknown> = {}): void {
    this.#files.set(path, { content, frontmatter });
    this.#registerParentFolders(path);
  }

  #registerParentFolders(path: VaultPath): void {
    const segments = path.split("/");
    segments.pop(); // drop the filename
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      this.#folders.add(current as VaultPath);
    }
  }

  find(path: VaultPath): Option<Note> {
    return this.#files.has(path) ? new Some<Note>(noteOf(path)) : new None<Note>();
  }

  listInFolder(folder: VaultPath): AsyncResult<VaultPath[], FolderNotFoundError> {
    if (!this.#folders.has(folder)) return AsyncResult.err(new FolderNotFoundError(folder));
    const prefix = folder ? `${folder}/` : "";
    const matches = [...this.#files.keys()].filter((p) => p.startsWith(prefix));
    return AsyncResult.ok(matches);
  }

  allMarkdownNotes(): VaultPath[] {
    return [...this.#files.keys()];
  }

  listFolders(): VaultPath[] {
    return [...this.#folders];
  }

  create(path: VaultPath, content: string): AsyncResult<Note, NoteAlreadyExistsError | NoteCreateError> {
    if (this.#files.has(path)) return AsyncResult.err(new NoteAlreadyExistsError(path));
    this.#registerParentFolders(path);
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

export class FakeWorkspaceService implements Pick<
  WorkspaceService,
  | "activeNote"
  | "isOpen"
  | "openNote"
  | "events"
  | "triggerHoverPreview"
  | "openFileMenu"
  | "layoutReady"
  | "onLayoutReady"
> {
  readonly #open = new Set<VaultPath>();
  readonly #emitter: TypedEmitter<WorkspaceEvents> = createNanoEvents();
  #active: Option<VaultPath> = new None<VaultPath>();
  #layoutReady = false;
  #layoutReadyCallbacks: (() => void)[] = [];

  readonly events: Subscribable<WorkspaceEvents> = this.#emitter;
  readonly hoverPreviewCalls: { path: VaultPath; event: MouseEvent }[] = [];
  readonly fileMenuCalls: { path: VaultPath; event: MouseEvent }[] = [];

  get layoutReady(): boolean {
    return this.#layoutReady;
  }

  onLayoutReady(callback: () => void): void {
    if (this.#layoutReady) {
      callback();
      return;
    }
    this.#layoutReadyCallbacks.push(callback);
  }

  setLayoutReady(value: boolean): void {
    this.#layoutReady = value;
    if (!value) return;
    const pending = this.#layoutReadyCallbacks;
    this.#layoutReadyCallbacks = [];
    for (const callback of pending) callback();
  }

  activeNote(): Option<VaultPath> {
    return this.#active;
  }

  isOpen(path: VaultPath): boolean {
    return this.#open.has(path);
  }

  openNote(path: VaultPath, _mode: OpenMode = "active"): AsyncResult<void, WorkspaceOpenError> {
    this.#open.add(path);
    this.#active = new Some<VaultPath>(path);
    return AsyncResult.ok(undefined);
  }

  setActive(path: VaultPath | null): void {
    this.#active = path === null ? new None<VaultPath>() : new Some<VaultPath>(path);
    this.#emitter.emit("active-note-changed", this.#active);
  }

  triggerHoverPreview(path: VaultPath, event: MouseEvent): void {
    this.hoverPreviewCalls.push({ path, event });
  }

  openFileMenu(path: VaultPath, event: MouseEvent): void {
    this.fileMenuCalls.push({ path, event });
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

export class FakeTemplaterService implements Pick<TemplaterService, "apply" | "cursorJump" | "isSupported"> {
  #supported = false;
  #transform: (content: string) => string = (content) => content;
  readonly applyCalls: { templatePath: VaultPath; targetPath: VaultPath; content: string }[] = [];
  readonly cursorJumps: VaultPath[] = [];

  setSupported(value: boolean): void {
    this.#supported = value;
  }

  setTransform(transform: (content: string) => string): void {
    this.#transform = transform;
  }

  apply(templatePath: VaultPath, targetPath: VaultPath, content: string): AsyncResult<string, never> {
    this.applyCalls.push({ templatePath, targetPath, content });
    return AsyncResult.ok(this.#transform(content));
  }

  cursorJump(path: VaultPath): AsyncResult<void, never> {
    this.cursorJumps.push(path);
    return AsyncResult.ok();
  }

  isSupported(): boolean {
    return this.#supported;
  }
}

export class FakeNoteMetadataService implements Pick<NoteMetadataService, "get"> {
  readonly #entries = new Map<VaultPath, NoteMetadata>();

  setMetadata(path: VaultPath, metadata: NoteMetadata): void {
    this.#entries.set(path, metadata);
  }

  clear(): void {
    this.#entries.clear();
  }

  get(path: VaultPath): Option<NoteMetadata> {
    const hit = this.#entries.get(path);
    return hit ? new Some(hit) : new None<NoteMetadata>();
  }
}

export class FakeNoticeService implements Pick<NoticeService, "show"> {
  readonly messages: string[] = [];

  show(message: string): void {
    this.messages.push(message);
  }
}

export { FakeModalHandle, FakeModalService } from "./modals/testing";
