import { createNanoEvents } from "nanoevents";

import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { AsyncResult, None, Some } from "@/infrastructure/result";
import type { Option } from "@/infrastructure/result";

import { FolderNotFoundError, NoteAlreadyExistsError, NoteNotFoundError, PluginDataIOError } from "./errors";
import { SuggestCancelled } from "./suggests/errors";

import type {
  FrontmatterError,
  NoteCreateError,
  NoteDeleteError,
  NoteReadError,
  NoteRenameError,
  NoteWriteError,
  WorkspaceOpenError,
} from "./errors";
import type { Disposer } from "./input-suggests/types";
import type { MarkdownRenderService } from "./internal/markdown-render-service";
import type { NoteMetadataService } from "./internal/note-metadata-service";
import type { NoteSizeEvents, NoteSizeService } from "./internal/note-size-service";
import type { NotesService } from "./internal/notes-service";
import type { NoticeService } from "./internal/notice-service";
import type { PluginData } from "./internal/plugin-data";
import type { TemplaterService } from "./internal/templater-service";
import type { WorkspaceService } from "./internal/workspace-service";
import type {
  MenuItemSpec,
  Note,
  NoteMetadata,
  NotesEvents,
  NoteSize,
  OpenMode,
  VaultPath,
  WorkspaceEvents,
} from "./types";

interface FakeEntry {
  content: string;
  frontmatter: Record<string, unknown>;
  size: number;
  mtime: number;
}

function basename(path: VaultPath): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/, "");
}

function folderOf(path: VaultPath): VaultPath {
  const index = path.lastIndexOf("/");
  return (index === -1 ? "" : path.slice(0, index)) as VaultPath;
}

function noteOf(path: VaultPath, stat: { size: number; mtime: number }): Note {
  return { path, basename: basename(path), folder: folderOf(path), size: stat.size, mtime: stat.mtime };
}

export class FakeNotesService implements Pick<
  NotesService,
  | "find"
  | "folderExists"
  | "listInFolder"
  | "listFolders"
  | "allMarkdownNotes"
  | "create"
  | "read"
  | "readCached"
  | "write"
  | "append"
  | "rename"
  | "delete"
  | "deleteFolder"
  | "updateFrontmatter"
  | "events"
> {
  readonly #files = new Map<VaultPath, FakeEntry>();
  readonly #folders = new Set<VaultPath>(["" as VaultPath]);
  readonly #emitter: TypedEmitter<NotesEvents> = createNanoEvents();

  readonly events: Subscribable<NotesEvents> = this.#emitter;

  #registerParentFolders(path: VaultPath): void {
    const segments = path.split("/");
    segments.pop(); // drop the filename
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      this.#folders.add(current as VaultPath);
    }
  }

  seed(
    path: VaultPath,
    content = "",
    frontmatter: Record<string, unknown> = {},
    stat: { size?: number; mtime?: number } = {},
  ): void {
    this.#files.set(path, { content, frontmatter, size: stat.size ?? 0, mtime: stat.mtime ?? 0 });
    this.#registerParentFolders(path);
  }

  // A file landing in the vault and Obsidian having parsed it are two separate moments; only
  // the second one makes its frontmatter readable. Tests that care about the gap drive them apart.
  emitMetadataChanged(path: VaultPath): void {
    this.#emitter.emit("metadata-changed", path);
  }

  // Mirrors the real service: `modify` fires for the byte change, and the metadata
  // re-parse (`metadata-changed`) follows it.
  emitModified(path: VaultPath): void {
    this.#emitter.emit("modified", path);
  }

  externalEdit(path: VaultPath, content: string): void {
    const entry = this.#files.get(path);
    this.#files.set(path, {
      content,
      frontmatter: entry?.frontmatter ?? {},
      size: entry?.size ?? 0,
      mtime: entry?.mtime ?? 0,
    });
    this.#emitter.emit("modified", path);
    this.#emitter.emit("metadata-changed", path);
  }

  find(path: VaultPath): Option<Note> {
    const entry = this.#files.get(path);
    return entry ? new Some<Note>(noteOf(path, entry)) : new None<Note>();
  }

  frontmatterOf(path: VaultPath): Record<string, unknown> | undefined {
    const entry = this.#files.get(path);
    return entry ? { ...entry.frontmatter } : undefined;
  }

  folderExists(folder: VaultPath): boolean {
    return this.#folders.has(folder);
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
    this.#files.set(path, { content, frontmatter: {}, size: 0, mtime: 0 });
    const note = noteOf(path, { size: 0, mtime: 0 });
    this.#emitter.emit("created", note);
    return AsyncResult.ok(note);
  }

  read(path: VaultPath): AsyncResult<string, NoteNotFoundError | NoteReadError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    return AsyncResult.ok(entry.content);
  }

  // The fake has no in-memory-cache/disk distinction, so a cached read is just a read.
  readCached(path: VaultPath): AsyncResult<string, NoteNotFoundError | NoteReadError> {
    return this.read(path);
  }

  write(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    this.#files.set(path, { ...entry, content });
    this.#emitter.emit("modified", path);
    this.#emitter.emit("metadata-changed", path);
    return AsyncResult.ok(undefined);
  }

  append(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError> {
    const entry = this.#files.get(path);
    if (!entry) return AsyncResult.err(new NoteNotFoundError(path));
    this.#files.set(path, { ...entry, content: entry.content + content });
    this.#emitter.emit("modified", path);
    this.#emitter.emit("metadata-changed", path);
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
    const note = noteOf(newPath, entry);
    this.#emitter.emit("renamed", { from: path, to: newPath });
    return AsyncResult.ok(note);
  }

  delete(path: VaultPath): AsyncResult<void, NoteNotFoundError | NoteDeleteError> {
    if (!this.#files.has(path)) return AsyncResult.err(new NoteNotFoundError(path));
    this.#files.delete(path);
    this.#emitter.emit("deleted", path);
    return AsyncResult.ok(undefined);
  }

  deleteFolder(path: VaultPath): AsyncResult<void, FolderNotFoundError | NoteDeleteError> {
    if (!this.#folders.has(path)) return AsyncResult.err(new FolderNotFoundError(path));
    for (const folder of this.#folders) {
      if (folder === path || folder.startsWith(`${path}/`)) this.#folders.delete(folder);
    }
    for (const file of this.#files.keys()) {
      if (!file.startsWith(`${path}/`)) continue;
      this.#files.delete(file);
      this.#emitter.emit("deleted", file);
    }
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
    // `modified` means "the bytes changed", full stop — the real service emits it off
    // the generic vault "modify" listener with no opinion on whether the change is
    // interesting. processFrontMatter is a vault write like any other, so it fires too.
    this.#emitter.emit("modified", path);
    this.#emitter.emit("metadata-changed", path);
    return AsyncResult.ok(undefined);
  }
}

export class FakeMarkdownRenderService implements Pick<MarkdownRenderService, "render"> {
  render(element: HTMLElement, markdown: string, _sourcePath: string): Disposer {
    element.textContent = markdown;
    return () => {
      element.replaceChildren();
    };
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
  | "openPathsMenu"
  | "pickFromMenu"
  | "previewFirstPath"
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
  readonly pathsMenuCalls: { paths: readonly VaultPath[]; event: MouseEvent; extraItems: readonly MenuItemSpec[] }[] =
    [];
  readonly pickFromMenuCalls: { labels: readonly string[]; event: MouseEvent }[] = [];
  pickFromMenuChoice: string | null = null;
  readonly previewFirstPathCalls: { paths: readonly VaultPath[]; event: MouseEvent }[] = [];

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

  openFileMenu(path: VaultPath, event: MouseEvent): boolean {
    this.fileMenuCalls.push({ path, event });
    return true;
  }

  openPathsMenu(paths: readonly VaultPath[], event: MouseEvent, extraItems: readonly MenuItemSpec[] = []): void {
    this.pathsMenuCalls.push({ paths, event, extraItems });
  }

  pickFromMenu(labels: readonly string[], event: MouseEvent): AsyncResult<string, SuggestCancelled> {
    this.pickFromMenuCalls.push({ labels, event });
    return this.pickFromMenuChoice === null
      ? AsyncResult.err(new SuggestCancelled())
      : AsyncResult.ok(this.pickFromMenuChoice);
  }

  previewFirstPath(paths: readonly VaultPath[], event: MouseEvent): void {
    this.previewFirstPathCalls.push({ paths, event });
  }
}

export class FakePluginData implements Pick<
  PluginData,
  "load" | "save" | "listFiles" | "readFile" | "writeFile" | "deleteFile"
> {
  #current: unknown;
  readonly files = new Map<string, string>();

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

  listFiles(): AsyncResult<string[], PluginDataIOError> {
    return AsyncResult.ok([...this.files.keys()]);
  }

  readFile(name: string): AsyncResult<string, PluginDataIOError> {
    const found = this.files.get(name);
    return found === undefined
      ? AsyncResult.err(new PluginDataIOError("read-file", new Error(`missing ${name}`)))
      : AsyncResult.ok(found);
  }

  writeFile(name: string, contents: string): AsyncResult<void, PluginDataIOError> {
    this.files.set(name, contents);
    return AsyncResult.ok(undefined);
  }

  deleteFile(name: string): AsyncResult<void, PluginDataIOError> {
    this.files.delete(name);
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

export class FakeNoteMetadataService implements Pick<NoteMetadataService, "get" | "onResolved"> {
  readonly #entries = new Map<VaultPath, NoteMetadata>();
  readonly #resolvedCallbacks = new Set<() => void>();

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

  onResolved(callback: () => void): () => void {
    this.#resolvedCallbacks.add(callback);
    return () => this.#resolvedCallbacks.delete(callback);
  }

  emitResolved(): void {
    for (const callback of this.#resolvedCallbacks) callback();
  }
}

export class FakeNoteSizeService implements Pick<NoteSizeService, "get" | "events"> {
  readonly #sizes = new Map<VaultPath, NoteSize>();
  readonly #emitter: TypedEmitter<NoteSizeEvents> = createNanoEvents();
  readonly events: Subscribable<NoteSizeEvents> = this.#emitter;

  // Stores and announces in one call, the way a real fill does — so a test that seeds
  // after mount exercises the subscription rather than the seeding path.
  setSize(path: VaultPath, size: NoteSize): void {
    this.#sizes.set(path, size);
    this.#emitter.emit("size-changed", path);
  }

  get(path: VaultPath): Option<NoteSize> {
    const hit = this.#sizes.get(path);
    return hit === undefined ? new None<NoteSize>() : new Some<NoteSize>(hit);
  }
}

export class FakeNoticeService implements Pick<NoticeService, "show"> {
  readonly messages: string[] = [];

  show(message: string): void {
    this.messages.push(message);
  }
}

export { FakeModalHandle, FakeModalService } from "./modals/testing";
