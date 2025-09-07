import { Injectable } from "@/infra/di/decorators/Injectable";
import { FilePath, type Vault as VaultContract } from "./contracts/vault.types";
import { JournalPlugin, ObsidianApp, Vault, VaultEvents } from "./obsidian.tokens";
import { inject } from "@/infra/di/inject";
import { TFile, TFolder } from "obsidian";
import { Result, type AsyncResult } from "@/infra/data-structures/result";
import { VaultError } from "./errors/VaultError";
import { normalizePath } from "vite";

@Injectable(Vault)
export class VaultAdapter implements VaultContract {
  #plugin = inject(JournalPlugin);
  #app = inject(ObsidianApp);
  #events = inject(VaultEvents);

  constructor() {
    this.#setupListeners();
  }

  getMarkdownFiles(): FilePath[] {
    return this.#app.vault.getMarkdownFiles().map((file) => FilePath(file.path));
  }

  getNotesInFolder(folderPath: string): Result<FilePath[], VaultError> {
    return Result.flowBinding(
      this,
      function* () {
        const folder = yield* this.#getFolder(folderPath);
        const notes: FilePath[] = [];
        const queue = [folder];
        while (queue.length > 0) {
          const currentFolder = queue.shift();
          if (!currentFolder) break;
          for (const child of currentFolder.children) {
            if (child instanceof TFile) {
              notes.push(FilePath(child.path));
            } else if (child instanceof TFolder) {
              queue.push(child);
            }
          }
        }

        return notes;
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  stats(path: FilePath): Result<{ name: string; fileName: string; folder: string }, VaultError> {
    return this.#getFile(path).map((file) => ({
      name: file.name,
      fileName: file.name,
      folder: file.parent?.path ?? "/",
    }));
  }

  exists(path: FilePath): boolean {
    return Result.isOk(this.#getFile(path));
  }

  create(path: FilePath, content?: string): AsyncResult<void, VaultError> {
    const normalizedPath = normalizePath(path);
    return Result.flowBinding(
      this,
      async function* () {
        yield* this.#ensureFolderExists(normalizedPath);
        await this.#app.vault.create(normalizedPath, content ?? "");
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  modify(path: string, content: string): AsyncResult<void, VaultError> {
    return Result.flowBinding(
      this,
      async function* () {
        const file = yield* this.#getFile(path);
        await this.#app.vault.modify(file, content);
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  append(path: string, content: string): AsyncResult<void, VaultError> {
    return Result.flowBinding(
      this,
      async function* () {
        const file = yield* this.#getFile(path);
        await this.#app.vault.append(file, content);
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  rename(path: string, newPath: string): AsyncResult<void, VaultError> {
    return Result.flowBinding(
      this,
      async function* () {
        const file = yield* this.#getFile(path);
        yield* this.#ensureFolderExists(newPath);
        await this.#app.vault.rename(file, newPath);
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  trash(path: string): AsyncResult<void, VaultError> {
    return Result.flowBinding(
      this,
      async function* () {
        const file = yield* this.#getFile(path);
        await this.#app.vault.trash(file, true);
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  delete(path: string): AsyncResult<void, VaultError> {
    return Result.flowBinding(
      this,
      async function* () {
        const file = yield* this.#getFile(path);
        await this.#app.vault.delete(file);
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  getContent(path: string): AsyncResult<string, VaultError> {
    return Result.flowBinding(
      this,
      async function* () {
        const file = yield* this.#getFile(path);
        return await this.#app.vault.cachedRead(file);
      },
      (error) => VaultError.fromCatch(error),
    );
  }

  #getFile(path: string): Result<TFile, VaultError> {
    const normalizedPath = normalizePath(path);
    return Result.fromNullable(
      this.#app.vault.getFileByPath(normalizedPath),
      () => new VaultError(`File ${normalizedPath} does not exist.`),
    );
  }

  #getFolder(path: string): Result<TFolder, VaultError> {
    const normalizedPath = normalizePath(path);
    return Result.fromNullable(
      this.#app.vault.getFolderByPath(normalizedPath),
      () => new VaultError(`Folder ${normalizedPath} does not exist.`),
    );
  }

  #setupListeners() {
    this.#plugin.registerEvent(
      this.#app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        this.#events.emit("created", FilePath(file.path));
      }),
    );
    this.#plugin.registerEvent(
      this.#app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        this.#events.emit("renamed", FilePath(oldPath), FilePath(file.path));
      }),
    );
    this.#plugin.registerEvent(
      this.#app.vault.on("delete", (file) => {
        if (!(file instanceof TFile)) return;
        this.#events.emit("deleted", FilePath(file.path));
      }),
    );
  }

  #ensureFolderExists(path: string) {
    return Result.try(
      async () => {
        if (!path) return;
        const directories = path.split("/");
        if (path.endsWith(".md")) {
          directories.pop();
        }
        if (directories.length > 0) {
          const folderPath = directories.join("/");
          if (!this.#app.vault.getAbstractFileByPath(folderPath)) {
            await this.#app.vault.createFolder(folderPath);
          }
        }
      },
      (error) => VaultError.fromCatch(error),
    );
  }
}
