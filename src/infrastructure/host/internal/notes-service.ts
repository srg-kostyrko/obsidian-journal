import { createNanoEvents } from "nanoevents";
import { TFile, TFolder } from "obsidian";

import { inject } from "@/infrastructure/di";
import { AsyncResult, Err, None, Ok, Some } from "@/infrastructure/result";
import type { Option, Result } from "@/infrastructure/result";

import {
  FolderNotFoundError,
  FrontmatterError,
  NoteAlreadyExistsError,
  NoteCreateError,
  NoteDeleteError,
  NoteNotFoundError,
  NoteReadError,
  NoteRenameError,
  NoteWriteError,
} from "../errors";

import { toNote } from "./obsidian-bridge";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { Note, NotesEvents, Subscribable, VaultPath } from "../types";
import type { TypedEmitter } from "./typed-emitter";

export class NotesService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #emitter: TypedEmitter<NotesEvents> = createNanoEvents();

  readonly events: Subscribable<NotesEvents> = this.#emitter;

  constructor() {
    this.#plugin.registerEvent(
      this.#app.vault.on("create", (file) => {
        if (file instanceof TFile) this.#emitter.emit("created", toNote(file));
      }),
    );
    this.#plugin.registerEvent(
      this.#app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          this.#emitter.emit("renamed", { from: oldPath as VaultPath, to: file.path as VaultPath });
        }
      }),
    );
    this.#plugin.registerEvent(
      this.#app.vault.on("delete", (file) => {
        if (file instanceof TFile) this.#emitter.emit("deleted", file.path as VaultPath);
      }),
    );
    this.#plugin.registerEvent(
      this.#app.metadataCache.on("changed", (file) => {
        if (file instanceof TFile) this.#emitter.emit("metadata-changed", file.path as VaultPath);
      }),
    );
  }

  find(path: VaultPath): Option<Note> {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return new None<Note>();
    return new Some<Note>(toNote(file));
  }

  listInFolder(folder: VaultPath): AsyncResult<VaultPath[], FolderNotFoundError> {
    const target = this.#app.vault.getFolderByPath(folder || "/");
    if (!target) return AsyncResult.err(new FolderNotFoundError(folder));
    const results: VaultPath[] = [];
    const queue: TFolder[] = [target];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const child of current.children) {
        if (child instanceof TFile) results.push(child.path as VaultPath);
        else if (child instanceof TFolder) queue.push(child);
      }
    }
    return AsyncResult.ok(results);
  }

  allMarkdownNotes(): VaultPath[] {
    return this.#app.vault.getMarkdownFiles().map((file) => file.path as VaultPath);
  }

  create(path: VaultPath, content: string): AsyncResult<Note, NoteAlreadyExistsError | NoteCreateError> {
    if (this.#app.vault.getAbstractFileByPath(path)) {
      return AsyncResult.err(new NoteAlreadyExistsError(path));
    }
    return AsyncResult.fromPromise(this.#create(path, content), (cause) => new NoteCreateError(path, cause));
  }

  read(path: VaultPath): AsyncResult<string, NoteNotFoundError | NoteReadError> {
    const file = this.#requireFile(path);
    if (!file.isOk()) return AsyncResult.err(file.error);
    return AsyncResult.fromPromise(this.#app.vault.read(file.value), (cause) => new NoteReadError(path, cause));
  }

  write(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError> {
    const file = this.#requireFile(path);
    if (!file.isOk()) return AsyncResult.err(file.error);
    return AsyncResult.fromPromise(
      this.#app.vault.modify(file.value, content),
      (cause) => new NoteWriteError(path, cause),
    );
  }

  append(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError> {
    const file = this.#requireFile(path);
    if (!file.isOk()) return AsyncResult.err(file.error);
    return AsyncResult.fromPromise(
      this.#app.vault.append(file.value, content),
      (cause) => new NoteWriteError(path, cause),
    );
  }

  rename(
    path: VaultPath,
    newPath: VaultPath,
  ): AsyncResult<Note, NoteNotFoundError | NoteAlreadyExistsError | NoteRenameError> {
    const file = this.#requireFile(path);
    if (!file.isOk()) return AsyncResult.err(file.error);
    if (this.#app.vault.getAbstractFileByPath(newPath)) {
      return AsyncResult.err(new NoteAlreadyExistsError(newPath));
    }
    return AsyncResult.fromPromise(
      this.#rename(file.value, newPath),
      (cause) => new NoteRenameError(path, newPath, cause),
    );
  }

  delete(path: VaultPath): AsyncResult<void, NoteNotFoundError | NoteDeleteError> {
    const file = this.#requireFile(path);
    if (!file.isOk()) return AsyncResult.err(file.error);
    return AsyncResult.fromPromise(
      this.#app.fileManager.trashFile(file.value),
      (cause) => new NoteDeleteError(path, cause),
    );
  }

  updateFrontmatter(
    path: VaultPath,
    mutate: (fm: Record<string, unknown>) => void,
  ): AsyncResult<void, NoteNotFoundError | FrontmatterError> {
    const file = this.#requireFile(path);
    if (!file.isOk()) return AsyncResult.err(file.error);
    return AsyncResult.fromPromise(
      this.#app.fileManager.processFrontMatter(file.value, mutate),
      (cause) => new FrontmatterError(path, cause),
    );
  }

  #requireFile(path: VaultPath): Result<TFile, NoteNotFoundError> {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return new Ok<TFile, NoteNotFoundError>(file);
    return new Err<TFile, NoteNotFoundError>(new NoteNotFoundError(path));
  }

  async #create(path: VaultPath, content: string): Promise<Note> {
    await this.#ensureFolderExists(path);
    const file = await this.#app.vault.create(path, content);
    return toNote(file);
  }

  async #rename(file: TFile, newPath: VaultPath): Promise<Note> {
    await this.#ensureFolderExists(newPath);
    await this.#app.vault.rename(file, newPath);
    return toNote(file);
  }

  async #ensureFolderExists(path: VaultPath): Promise<void> {
    const segments = path.split("/");
    if (path.endsWith(".md")) segments.pop();
    if (segments.length === 0) return;
    const folderPath = segments.join("/");
    if (!folderPath) return;
    if (!this.#app.vault.getAbstractFileByPath(folderPath)) {
      await this.#app.vault.createFolder(folderPath);
    }
  }
}
