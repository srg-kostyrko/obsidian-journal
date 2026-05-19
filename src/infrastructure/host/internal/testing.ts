import { TFile, TFolder, type App, type CachedMetadata, type EventRef, type PaneType, type Plugin } from "obsidian";

type AnyHandler = (...arguments_: unknown[]) => void;

class FakeDispatcher {
  readonly #handlers = new Map<string, Set<AnyHandler>>();

  on(event: string, handler: AnyHandler): EventRef {
    const set = this.#handlers.get(event) ?? new Set<AnyHandler>();
    set.add(handler);
    this.#handlers.set(event, set);
    return { event, handler };
  }

  detach(ref: EventRef): void {
    const { event, handler } = ref as unknown as { event: string; handler: AnyHandler };
    this.#handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...arguments_: unknown[]): void {
    for (const handler of this.#handlers.get(event) ?? new Set<AnyHandler>()) {
      handler(...arguments_);
    }
  }
}

export interface FakeWorkspaceState {
  activeFile: TFile | null;
  openPaths: Set<string>;
  openCalls: { path: string; mode: PaneType | false }[];
}

export interface FakeFileSystemEntry {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
  readonly metadata: CachedMetadata;
}

export interface FakeHost {
  readonly app: App;
  readonly plugin: Plugin;
  readonly files: Map<string, FakeFileSystemEntry>;
  readonly folders: Set<string>;
  readonly workspace: FakeWorkspaceState;
  readonly pluginData: { current: unknown; loadError?: Error; saveError?: Error };
  readonly registeredEventReferences: EventRef[];

  putFile(path: string, content?: string, frontmatter?: Record<string, unknown>): TFile;
  putFolder(path: string): TFolder;
  emitVault(event: "create" | "rename" | "delete", ...arguments_: unknown[]): void;
  emitMetadata(path: string, metadata?: CachedMetadata): void;
  emitActiveLeafChange(file: TFile | null): void;
  triggerUnload(): void;
}

function makeFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  const parts = path.split("/");
  const last = parts.pop() ?? path;
  file.name = last;
  file.basename = last.replace(/\.md$/, "");
  file.extension = "md";
  return file;
}

function makeFolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  folder.name = path.split("/").pop() ?? "";
  return folder;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function createFakeHost(): FakeHost {
  const files = new Map<string, FakeFileSystemEntry>();
  const folders = new Set<string>([""]);
  const fileObjects = new Map<string, TFile>();
  const folderObjects = new Map<string, TFolder>([["", makeFolder("")]]);
  const vault = new FakeDispatcher();
  const metadata = new FakeDispatcher();
  const workspaceEvents = new FakeDispatcher();
  const workspaceState: FakeWorkspaceState = { activeFile: null, openPaths: new Set(), openCalls: [] };
  const pluginData: FakeHost["pluginData"] = { current: undefined };
  const registeredEventReferences: EventRef[] = [];
  const unloadCallbacks: (() => void)[] = [];

  function ensureFolderChain(path: string): void {
    if (!path) return;
    const segments = path.split("/");
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!folders.has(current)) {
        folders.add(current);
        const folder = makeFolder(current);
        folderObjects.set(current, folder);
        const parentFolder = folderObjects.get(parentPath(current));
        if (parentFolder && !parentFolder.children.includes(folder)) {
          parentFolder.children.push(folder);
        }
      }
    }
  }

  function setParent(file: TFile | TFolder): void {
    file.parent = folderObjects.get(parentPath(file.path)) ?? folderObjects.get("") ?? null;
  }

  function attachChild(child: TFile | TFolder): void {
    const parent = folderObjects.get(parentPath(child.path));
    if (parent && !parent.children.includes(child)) parent.children.push(child);
  }

  function detachChild(child: TFile | TFolder): void {
    const parent = folderObjects.get(parentPath(child.path));
    if (!parent) return;
    const index = parent.children.indexOf(child);
    if (index !== -1) parent.children.splice(index, 1);
  }

  const vaultApi = {
    on: (event: string, callback: AnyHandler): EventRef => vault.on(event, callback),
    offref: (ref: EventRef): void => vault.detach(ref),
    getAbstractFileByPath(path: string): TFile | TFolder | null {
      return fileObjects.get(path) ?? folderObjects.get(path) ?? null;
    },
    getFolderByPath(path: string): TFolder | null {
      return folderObjects.get(path) ?? null;
    },
    getMarkdownFiles(): TFile[] {
      return [...fileObjects.values()];
    },
    getAllLoadedFiles(): (TFile | TFolder)[] {
      return [...folderObjects.values(), ...fileObjects.values()];
    },
    async create(path: string, content: string): Promise<TFile> {
      if (fileObjects.has(path)) throw new Error(`exists: ${path}`);
      ensureFolderChain(parentPath(path));
      files.set(path, { content, frontmatter: {}, metadata: {} });
      const file = makeFile(path);
      setParent(file);
      fileObjects.set(path, file);
      attachChild(file);
      vault.emit("create", file);
      return file;
    },
    async read(file: TFile): Promise<string> {
      return files.get(file.path)?.content ?? "";
    },
    async modify(file: TFile, content: string): Promise<void> {
      const existing = files.get(file.path);
      if (!existing) throw new Error(`missing: ${file.path}`);
      files.set(file.path, { ...existing, content });
    },
    async append(file: TFile, content: string): Promise<void> {
      const existing = files.get(file.path);
      if (!existing) throw new Error(`missing: ${file.path}`);
      files.set(file.path, { ...existing, content: existing.content + content });
    },
    async rename(file: TFile, newPath: string): Promise<void> {
      const existing = files.get(file.path);
      if (!existing) throw new Error(`missing: ${file.path}`);
      if (fileObjects.has(newPath)) throw new Error(`exists: ${newPath}`);
      const oldPath = file.path;
      detachChild(file);
      files.delete(oldPath);
      fileObjects.delete(oldPath);
      ensureFolderChain(parentPath(newPath));
      files.set(newPath, existing);
      file.path = newPath;
      file.name = newPath.split("/").pop() ?? newPath;
      file.basename = file.name.replace(/\.md$/, "");
      setParent(file);
      fileObjects.set(newPath, file);
      attachChild(file);
      vault.emit("rename", file, oldPath);
    },
    async delete(file: TFile): Promise<void> {
      detachChild(file);
      files.delete(file.path);
      fileObjects.delete(file.path);
      vault.emit("delete", file);
    },
    async createFolder(path: string): Promise<void> {
      ensureFolderChain(path);
    },
  };

  const metadataCacheApi = {
    on: (event: string, callback: AnyHandler): EventRef => metadata.on(event, callback),
    offref: (ref: EventRef): void => metadata.detach(ref),
    getCache(path: string): CachedMetadata | null {
      return files.get(path)?.metadata ?? null;
    },
  };

  const fileManagerApi = {
    async processFrontMatter(file: TFile, mutate: (fm: Record<string, unknown>) => void): Promise<void> {
      const existing = files.get(file.path);
      if (!existing) throw new Error(`missing: ${file.path}`);
      const next = { ...existing.frontmatter };
      mutate(next);
      files.set(file.path, { ...existing, frontmatter: next });
    },
    async trashFile(file: TFile): Promise<void> {
      detachChild(file);
      files.delete(file.path);
      fileObjects.delete(file.path);
      vault.emit("delete", file);
    },
  };

  const workspaceApi = {
    on: (event: string, callback: AnyHandler): EventRef => workspaceEvents.on(event, callback),
    offref: (ref: EventRef): void => workspaceEvents.detach(ref),
    getActiveFile(): TFile | null {
      return workspaceState.activeFile;
    },
    getLeavesOfType(_type: string): { view: { file: TFile | null }; openFile: () => Promise<undefined> }[] {
      return [...workspaceState.openPaths].map((path) => ({
        view: { file: fileObjects.get(path) ?? null },
        openFile: async () => undefined,
      }));
    },
    setActiveLeaf(): void {
      /* no-op */
    },
    getLeaf(mode: PaneType | false) {
      return {
        async openFile(file: TFile): Promise<void> {
          workspaceState.openPaths.add(file.path);
          workspaceState.openCalls.push({ path: file.path, mode });
          workspaceState.activeFile = file;
        },
      };
    },
  };

  const app = {
    vault: vaultApi,
    workspace: workspaceApi,
    metadataCache: metadataCacheApi,
    fileManager: fileManagerApi,
  } as unknown as App;

  const plugin = {
    app,
    registerEvent(ref: EventRef): void {
      registeredEventReferences.push(ref);
    },
    register(callback: () => void): void {
      unloadCallbacks.push(callback);
    },
    async loadData(): Promise<unknown> {
      if (pluginData.loadError) throw pluginData.loadError;
      return pluginData.current;
    },
    async saveData(data: unknown): Promise<void> {
      if (pluginData.saveError) throw pluginData.saveError;
      pluginData.current = data;
    },
  } as unknown as Plugin;

  return {
    app,
    plugin,
    files,
    folders,
    workspace: workspaceState,
    pluginData,
    registeredEventReferences,
    putFile(path, content = "", frontmatter = {}): TFile {
      ensureFolderChain(parentPath(path));
      files.set(path, { content, frontmatter, metadata: {} });
      const file = makeFile(path);
      setParent(file);
      fileObjects.set(path, file);
      attachChild(file);
      return file;
    },
    putFolder(path): TFolder {
      ensureFolderChain(path);
      return folderObjects.get(path)!;
    },
    emitVault(event, ...arguments_): void {
      vault.emit(event, ...arguments_);
    },
    emitMetadata(path, cached): void {
      if (cached) {
        const existing = files.get(path);
        if (existing) files.set(path, { ...existing, metadata: cached });
      }
      metadata.emit("changed", fileObjects.get(path), "", cached ?? {});
    },
    emitActiveLeafChange(file): void {
      workspaceState.activeFile = file;
      workspaceEvents.emit("active-leaf-change", { view: { file } });
    },
    triggerUnload(): void {
      for (const callback of unloadCallbacks) callback();
      unloadCallbacks.length = 0;
    },
  };
}
