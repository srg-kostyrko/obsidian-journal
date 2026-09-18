import {
  TFile,
  TFolder,
  type App,
  type CachedMetadata,
  type Command,
  type EventRef,
  type ItemView,
  type MarkdownPostProcessorContext,
  type MarkdownRenderChild,
  type PaneType,
  type Plugin,
  type PluginSettingTab,
  type WorkspaceLeaf,
} from "obsidian";

type CodeBlockProcessor = (
  source: string,
  element: HTMLElement,
  context: MarkdownPostProcessorContext,
) => void | Promise<void>;

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
    const handlers = this.#handlers.get(event) ?? new Set<AnyHandler>();
    for (const handler of handlers) {
      handler(...arguments_);
    }
  }
}

export interface FakeWorkspaceState {
  activeFile: TFile | null;
  openPaths: Set<string>;
  // Which window each open path's leaf sits in, and which window the user is currently in.
  // Popout windows are what make workspace-wide leaf reuse steal focus, so leaf lookups that
  // must stay window-local can only be exercised with both modelled.
  openWindows: Map<string, string>;
  activeWindow: string;
  focusedPaths: string[];
  openCalls: { path: string; mode: PaneType | false }[];
  triggerCalls: { event: string; arguments_: unknown[] }[];
  detachedTypes: string[];
  viewStateCalls: { type: string; placement: "left" | "right" | "tab" }[];
  activatedTypes: string[];
  headerRefreshedTypes: string[];
  updateHeaderThrows: boolean;
  sidebarLeafAvailable: boolean;
  saveLayoutCalls: number;
  revealLeafCalls: number;
  layoutReady: boolean;
  // The fake keys leaves by the path they hold, so a pin is a property of that path. A retarget
  // moves the path's window and pin to the new path, the way Obsidian's openFile keeps the leaf.
  pinnedPaths: Set<string>;
  retargetCalls: { from: string; to: string }[];
  // While set, a new leaf's openFile holds the note — active, in view — and only settles with this
  // promise, the way Obsidian assigns view.file before it awaits the disk read.
  pendingLoad: Promise<void> | null;
  // Open paths whose leaf sits in a sidebar rather than the main area.
  leafRoots: Map<string, "left" | "right">;
  // Open paths whose leaf was restored into a background tab and holds a deferred view: no
  // `view.file`, the path only in `getViewState().state.file`, until the leaf is shown.
  deferredPaths: Set<string>;
  // Open paths that also sit, unpinned, in a second leaf docked in a sidebar — listed ahead of
  // the main-area leaf. Obsidian iterates the root split first, so this order is defensive: it
  // proves the pinned lookup filters by area rather than relying on iteration order.
  sidebarCopies: Map<string, "left" | "right">;
}

export interface FakeRegisteredView {
  readonly type: string;
  readonly factory: (leaf: WorkspaceLeaf) => ItemView;
}

interface FakeLeaf {
  openFile(file: TFile): Promise<void>;
  setViewState(state: { type: string; active?: boolean }): Promise<void>;
  updateHeader(): void;
  setPinned(pinned: boolean): void;
}

interface FakeMarkdownLeaf {
  readonly view: { file: TFile | null };
  openFile(file: TFile): Promise<void>;
  getContainer(): { win: Window };
  getRoot(): object;
  getViewState(): { type: string; state: { file: string }; pinned?: boolean };
  setPinned(pinned: boolean): void;
}

export interface FakeFileSystemEntry {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
  readonly metadata: CachedMetadata;
}

export interface FakeRibbonIcon {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly callback: (event: MouseEvent) => void;
  readonly element: HTMLElement;
}

export interface FakeHost {
  readonly app: App;
  readonly plugin: Plugin;
  readonly files: Map<string, FakeFileSystemEntry>;
  readonly folders: Set<string>;
  readonly workspace: FakeWorkspaceState;
  readonly pluginData: { current: unknown; loadError?: Error; saveError?: Error };
  readonly registeredEventReferences: EventRef[];
  readonly commands: Map<string, Command>;
  readonly protocolHandlers: Map<string, (parameters: Record<string, string>) => void>;
  readonly ribbonIcons: FakeRibbonIcon[];
  readonly settingTabs: PluginSettingTab[];
  readonly codeBlockProcessors: Map<string, CodeBlockProcessor>;
  readonly registeredViews: Map<string, FakeRegisteredView>;
  readonly promptedDeletions: readonly TFile[];

  putFile(path: string, content?: string, frontmatter?: Record<string, unknown>): TFile;
  putFolder(path: string): TFolder;
  putPlugin(id: string, instance: object): void;
  putCorePlugin(id: string, instance: object, enabled?: boolean): void;
  setPropertyType(name: string, type: string): void;
  assignPropertyType(name: string, type: string): void;
  emitVault(event: "create" | "rename" | "delete" | "modify", ...arguments_: unknown[]): void;
  emitMetadata(path: string, metadata?: CachedMetadata): void;
  emitActiveLeafChange(file: TFile | null): void;
  emitFileOpen(file: TFile | null): void;
  emitProtocol(action: string, parameters: Record<string, string>): void;
  triggerUnload(): void;
  setLayoutReady(): void;
  runCodeBlockProcessor(
    language: string,
    source: string,
    sourcePath?: string,
  ): { el: HTMLElement; ctx: MarkdownPostProcessorContext; child?: MarkdownRenderChild };
}

const MAIN_WINDOW = "main";

function nameParts(name: string): { basename: string; extension: string } {
  const dot = name.lastIndexOf(".");
  return dot <= 0
    ? { basename: name, extension: "" }
    : { basename: name.slice(0, dot), extension: name.slice(dot + 1) };
}

function makeFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  const parts = path.split("/");
  const last = parts.pop() ?? path;
  file.name = last;
  const { basename, extension } = nameParts(last);
  file.basename = basename;
  file.extension = extension;
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

// getFileCache reads `metadata`, every write path sets `frontmatter`. Deriving one from the other
// on write is what keeps a seeded note and a service-written note equally visible to the index.
// Nothing here emits: events stay explicit through emitVault/emitMetadata.
function entryFor(content: string, frontmatter: Record<string, unknown>): FakeFileSystemEntry {
  return { content, frontmatter, metadata: metadataWithFrontmatter({}, frontmatter) };
}

// A frontmatter write must leave the rest of a staged CachedMetadata — tags, links, headings put
// there by emitMetadata — untouched, so it patches the frontmatter field rather than rebuilding.
function metadataWithFrontmatter(metadata: CachedMetadata, frontmatter: Record<string, unknown>): CachedMetadata {
  const next: CachedMetadata = { ...metadata };
  if (Object.keys(frontmatter).length > 0) next.frontmatter = frontmatter;
  else delete next.frontmatter;
  return next;
}

export function createFakeHost(): FakeHost {
  const files = new Map<string, FakeFileSystemEntry>();
  const folders = new Set<string>([""]);
  const fileObjects = new Map<string, TFile>();
  const folderObjects = new Map<string, TFolder>([["", makeFolder("")]]);
  const vault = new FakeDispatcher();
  const metadata = new FakeDispatcher();
  const workspaceEvents = new FakeDispatcher();
  const workspaceState: FakeWorkspaceState = {
    activeFile: null,
    openPaths: new Set(),
    openWindows: new Map(),
    activeWindow: MAIN_WINDOW,
    focusedPaths: [],
    openCalls: [],
    triggerCalls: [],
    detachedTypes: [],
    viewStateCalls: [],
    activatedTypes: [],
    headerRefreshedTypes: [],
    updateHeaderThrows: false,
    sidebarLeafAvailable: true,
    saveLayoutCalls: 0,
    revealLeafCalls: 0,
    layoutReady: true,
    pinnedPaths: new Set(),
    retargetCalls: [],
    pendingLoad: null,
    leafRoots: new Map(),
    deferredPaths: new Set(),
    sidebarCopies: new Map(),
  };
  const pluginData: FakeHost["pluginData"] = { current: undefined };
  const registeredEventReferences: EventRef[] = [];
  const commands = new Map<string, Command>();
  const protocolHandlers = new Map<string, (parameters: Record<string, string>) => void>();
  const ribbonIcons: FakeRibbonIcon[] = [];
  const settingTabs: PluginSettingTab[] = [];
  const codeBlockProcessors = new Map<string, CodeBlockProcessor>();
  const registeredViews = new Map<string, FakeRegisteredView>();
  const viewLeavesByType = new Map<string, FakeLeaf[]>();
  const windowObjects = new Map<string, Window>();
  const unloadCallbacks: (() => void)[] = [];
  const layoutReadyCallbacks: (() => void)[] = [];
  const communityPlugins = new Map<string, object>();
  const corePlugins = new Map<string, { enabled: boolean; instance: object }>();

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
    // Obsidian addresses the vault root as "/", while this fake keys it as "".
    getAbstractFileByPath(path: string): TFile | TFolder | null {
      return fileObjects.get(path) ?? folderObjects.get(path === "/" ? "" : path) ?? null;
    },
    getFolderByPath(path: string): TFolder | null {
      return folderObjects.get(path === "/" ? "" : path) ?? null;
    },
    getMarkdownFiles(): TFile[] {
      return [...fileObjects.values()].filter((file) => file.extension === "md");
    },
    getFiles(): TFile[] {
      return [...fileObjects.values()];
    },
    getAllLoadedFiles(): (TFile | TFolder)[] {
      return [...folderObjects.values(), ...fileObjects.values()];
    },
    async create(path: string, content: string): Promise<TFile> {
      if (fileObjects.has(path)) throw new Error(`exists: ${path}`);
      ensureFolderChain(parentPath(path));
      files.set(path, entryFor(content, {}));
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
    async cachedRead(file: TFile): Promise<string> {
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
      const { basename, extension } = nameParts(file.name);
      file.basename = basename;
      file.extension = extension;
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
    getFileCache(file: TFile): CachedMetadata | null {
      return files.get(file.path)?.metadata ?? null;
    },
    // Models Obsidian's "shortest" link format only: the name alone when it is unique in the
    // vault, the path otherwise. The absolute and relative formats are Obsidian's to get right.
    fileToLinktext(file: TFile, _sourcePath: string, omitMdExtension = true): string {
      const bare = file.extension === "md" && omitMdExtension;
      const unique = [...fileObjects.values()].filter((other) => other.name === file.name).length === 1;
      if (unique) return bare ? file.basename : file.name;
      return bare ? file.path.replace(/\.md$/, "") : file.path;
    },
  };

  const propertyTypes = new Map<string, { name: string; widget: string }>();
  const assignedPropertyTypes = new Map<string, string>();
  const metadataTypeManagerApi = {
    getAllProperties(): Record<string, { name: string; widget: string }> {
      return Object.fromEntries(propertyTypes);
    },
    getAssignedWidget(name: string): string | null {
      return assignedPropertyTypes.get(name.toLowerCase()) ?? null;
    },
  };

  const promptedDeletions: TFile[] = [];

  const fileManagerApi = {
    promptForFileDeletion(file: TFile): void {
      promptedDeletions.push(file);
    },
    // Obsidian's own renameFile is `runAsyncLinkUpdate(() => vault.rename(...))`: the rename
    // itself is identical, and repairing every reference to the old name is the whole of what
    // it adds. Only the `[[...]]` link form is modelled — enough to tell the two APIs apart.
    async renameFile(file: TFile | TFolder, newPath: string): Promise<void> {
      if (!(file instanceof TFile)) throw new Error(`not a file: ${file.path}`);
      const oldBasename = file.basename;
      await vaultApi.rename(file, newPath);
      const newBasename = file.basename;
      if (oldBasename === newBasename) return;
      for (const [path, entry] of files) {
        const repaired = entry.content.split(`[[${oldBasename}]]`).join(`[[${newBasename}]]`);
        if (repaired !== entry.content) files.set(path, { ...entry, content: repaired });
      }
    },
    async processFrontMatter(file: TFile, mutate: (fm: Record<string, unknown>) => void): Promise<void> {
      const existing = files.get(file.path);
      if (!existing) throw new Error(`missing: ${file.path}`);
      const next = { ...existing.frontmatter };
      mutate(next);
      files.set(file.path, {
        ...existing,
        frontmatter: next,
        metadata: metadataWithFrontmatter(existing.metadata, next),
      });
    },
    async trashFile(file: TFile | TFolder): Promise<void> {
      detachChild(file);
      if (file instanceof TFolder) {
        const prefix = `${file.path}/`;
        for (const path of folders) {
          if (path !== file.path && !path.startsWith(prefix)) continue;
          folders.delete(path);
          folderObjects.delete(path);
        }
        for (const path of fileObjects.keys()) {
          if (!path.startsWith(prefix)) continue;
          files.delete(path);
          fileObjects.delete(path);
        }
      } else {
        files.delete(file.path);
        fileObjects.delete(file.path);
      }
      vault.emit("delete", file);
    },
  };

  const leftRibbon = {
    addRibbonItemButton(id: string, icon: string, title: string, callback: (event: MouseEvent) => void): HTMLElement {
      const element = document.createElement("div");
      // attached so ribbon-removal can be observed via element.isConnected
      document.body.append(element);
      ribbonIcons.push({ id, icon, title, callback, element });
      return element;
    },
    removeRibbonAction(id: string): void {
      const index = ribbonIcons.findIndex((ribbon) => ribbon.id === id);
      if (index !== -1) ribbonIcons.splice(index, 1);
    },
  };

  const splits = { root: {}, left: {}, right: {} };

  // Every window answers `activeWindow` the way Obsidian's does — with whichever window currently
  // holds focus — so a service can reach the focused window from any window it already holds.
  function windowFor(id: string): Window {
    const existing = windowObjects.get(id);
    if (existing) return existing;
    const created = {
      id,
      get activeWindow(): Window {
        return windowFor(workspaceState.activeWindow);
      },
    } as unknown as Window;
    windowObjects.set(id, created);
    return created;
  }

  function makeLeaf(placement: "left" | "right" | "tab", openMode: PaneType | false = false) {
    let assignedType: string | null = null;
    let held: string | null = null;
    // A pin belongs to the leaf, as in Obsidian: set on an empty leaf, it carries over to the file
    // opened into it. pinnedPaths can only show it once the leaf holds a path.
    let pinned = false;
    const leaf = {
      async openFile(file: TFile): Promise<void> {
        held = file.path;
        workspaceState.openPaths.add(file.path);
        workspaceState.openWindows.set(file.path, workspaceState.activeWindow);
        workspaceState.openCalls.push({ path: file.path, mode: openMode });
        workspaceState.activeFile = file;
        if (pinned) workspaceState.pinnedPaths.add(file.path);
        if (workspaceState.pendingLoad) await workspaceState.pendingLoad;
      },
      setPinned(value: boolean): void {
        pinned = value;
        if (held === null) return;
        if (value) workspaceState.pinnedPaths.add(held);
        else workspaceState.pinnedPaths.delete(held);
      },
      async setViewState(state: { type: string; active?: boolean }): Promise<void> {
        assignedType = state.type;
        workspaceState.viewStateCalls.push({ type: state.type, placement });
        if (state.active) workspaceState.activatedTypes.push(state.type);
        const leaves = viewLeavesByType.get(state.type) ?? [];
        leaves.push(leaf);
        viewLeavesByType.set(state.type, leaves);
      },
      updateHeader(): void {
        if (workspaceState.updateHeaderThrows) throw new Error("updateHeader failed");
        if (assignedType) workspaceState.headerRefreshedTypes.push(assignedType);
      },
    };
    return leaf;
  }

  function markdownLeafFor(initialPath: string, sidebarCopy?: "left" | "right"): FakeMarkdownLeaf {
    let path = initialPath;
    return {
      get view() {
        return { file: workspaceState.deferredPaths.has(path) ? null : (fileObjects.get(path) ?? null) };
      },
      async openFile(file: TFile): Promise<void> {
        const win = workspaceState.openWindows.get(path) ?? MAIN_WINDOW;
        const pinned = workspaceState.pinnedPaths.delete(path);
        workspaceState.deferredPaths.delete(path);
        workspaceState.openPaths.delete(path);
        workspaceState.openWindows.delete(path);
        workspaceState.openPaths.add(file.path);
        workspaceState.openWindows.set(file.path, win);
        if (pinned) workspaceState.pinnedPaths.add(file.path);
        workspaceState.retargetCalls.push({ from: path, to: file.path });
        workspaceState.activeFile = file;
        path = file.path;
      },
      getContainer: () => ({ win: windowFor(workspaceState.openWindows.get(path) ?? MAIN_WINDOW) }),
      getRoot: () => {
        const side = sidebarCopy ?? workspaceState.leafRoots.get(path);
        return side === undefined ? splits.root : splits[side];
      },
      getViewState: () => ({
        type: "markdown",
        state: { file: path },
        ...(sidebarCopy === undefined && workspaceState.pinnedPaths.has(path) && { pinned: true }),
      }),
      setPinned(pinned: boolean): void {
        if (pinned) workspaceState.pinnedPaths.add(path);
        else workspaceState.pinnedPaths.delete(path);
      },
    };
  }

  const workspaceApi = {
    leftRibbon,
    on: (event: string, callback: AnyHandler): EventRef => workspaceEvents.on(event, callback),
    offref: (ref: EventRef): void => workspaceEvents.detach(ref),
    getActiveFile(): TFile | null {
      return workspaceState.activeFile;
    },
    getLeavesOfType(type: string): FakeLeaf[] | FakeMarkdownLeaf[] {
      // The tracked branch is keyed by registered journal view types (`journal-view:*`),
      // so it never collides with the note-path fallback used for `"markdown"` lookups.
      const tracked = viewLeavesByType.get(type);
      if (tracked) return tracked;
      return [...workspaceState.openPaths].flatMap((path) => {
        const side = workspaceState.sidebarCopies.get(path);
        const main = markdownLeafFor(path);
        return side === undefined ? [main] : [markdownLeafFor(path, side), main];
      });
    },
    containerEl: { win: windowFor(MAIN_WINDOW) },
    rootSplit: splits.root,
    leftSplit: splits.left,
    rightSplit: splits.right,
    // Showing a leaf's tab loads a deferred view, so focusing one leaves it holding its file.
    setActiveLeaf(leaf: FakeMarkdownLeaf): void {
      const path = leaf.view.file?.path ?? leaf.getViewState().state.file;
      workspaceState.deferredPaths.delete(path);
      workspaceState.focusedPaths.push(path);
    },
    getLeaf(mode: PaneType | false) {
      return makeLeaf("tab", mode);
    },
    getLeftLeaf(_split: boolean) {
      return workspaceState.sidebarLeafAvailable ? makeLeaf("left") : null;
    },
    getRightLeaf(_split: boolean) {
      return workspaceState.sidebarLeafAvailable ? makeLeaf("right") : null;
    },
    async revealLeaf(_leaf: unknown): Promise<void> {
      workspaceState.revealLeafCalls++;
    },
    trigger(event: string, ...arguments_: unknown[]): void {
      workspaceState.triggerCalls.push({ event, arguments_ });
    },
    detachLeavesOfType(type: string): void {
      workspaceState.detachedTypes.push(type);
      viewLeavesByType.delete(type);
    },
    requestSaveLayout(): void {
      workspaceState.saveLayoutCalls++;
    },
    get layoutReady(): boolean {
      return workspaceState.layoutReady;
    },
    onLayoutReady(callback: () => void): void {
      if (workspaceState.layoutReady) callback();
      else layoutReadyCallbacks.push(callback);
    },
  };

  const app = {
    vault: vaultApi,
    workspace: workspaceApi,
    metadataCache: metadataCacheApi,
    metadataTypeManager: metadataTypeManagerApi,
    fileManager: fileManagerApi,
    plugins: {
      getPlugin: (id: string): object | null => communityPlugins.get(id) ?? null,
    },
    internalPlugins: {
      getEnabledPluginById: (id: string): object | null => {
        const entry = corePlugins.get(id);
        return entry?.enabled ? entry.instance : null;
      },
    },
  } as unknown as App;

  const plugin = {
    app,
    registerEvent(ref: EventRef): void {
      registeredEventReferences.push(ref);
    },
    register(callback: () => void): void {
      unloadCallbacks.push(callback);
    },
    addCommand(command: Command): Command {
      commands.set(command.id, command);
      return command;
    },
    registerObsidianProtocolHandler(action: string, handler: (parameters: Record<string, string>) => void): void {
      protocolHandlers.set(action, handler);
    },
    removeCommand(commandId: string): void {
      commands.delete(commandId);
    },
    async loadData(): Promise<unknown> {
      if (pluginData.loadError) throw pluginData.loadError;
      return pluginData.current;
    },
    async saveData(data: unknown): Promise<void> {
      if (pluginData.saveError) throw pluginData.saveError;
      pluginData.current = data;
    },
    registerMarkdownCodeBlockProcessor(language: string, handler: CodeBlockProcessor): void {
      codeBlockProcessors.set(language, handler);
    },
    registerView(type: string, factory: (leaf: WorkspaceLeaf) => ItemView): void {
      registeredViews.set(type, { type, factory });
      unloadCallbacks.push(() => registeredViews.delete(type));
    },
    addSettingTab(tab: PluginSettingTab): void {
      settingTabs.push(tab);
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
    commands,
    protocolHandlers,
    ribbonIcons,
    settingTabs,
    codeBlockProcessors,
    registeredViews,
    promptedDeletions,
    putFile(path, content = "", frontmatter = {}): TFile {
      ensureFolderChain(parentPath(path));
      files.set(path, entryFor(content, frontmatter));
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
    putPlugin(id, instance): void {
      communityPlugins.set(id, instance);
    },
    putCorePlugin(id, instance, enabled = true): void {
      corePlugins.set(id, { enabled, instance });
    },
    setPropertyType(name, type): void {
      propertyTypes.set(name.toLowerCase(), { name, widget: type });
    },
    assignPropertyType(name, type): void {
      assignedPropertyTypes.set(name.toLowerCase(), type);
    },
    emitVault(event, ...arguments_): void {
      vault.emit(event, ...arguments_);
    },
    emitMetadata(path, cached): void {
      if (cached) {
        const existing = files.get(path);
        // The entry's own `frontmatter` is what a later processFrontMatter mutates, so staged
        // frontmatter has to reach it or the next write drops what this call staged.
        if (existing) {
          files.set(path, { ...existing, frontmatter: cached.frontmatter ?? existing.frontmatter, metadata: cached });
        }
      }
      metadata.emit("changed", fileObjects.get(path), "", cached ?? {});
    },
    emitActiveLeafChange(file): void {
      workspaceState.activeFile = file;
      workspaceEvents.emit("active-leaf-change", { view: { file } });
    },
    emitFileOpen(file): void {
      workspaceState.activeFile = file;
      workspaceEvents.emit("file-open", file);
    },
    emitProtocol(action, parameters): void {
      protocolHandlers.get(action)?.(parameters);
    },
    triggerUnload(): void {
      for (const callback of unloadCallbacks) callback();
      unloadCallbacks.length = 0;
    },
    setLayoutReady(): void {
      workspaceState.layoutReady = true;
      const callbacks = [...layoutReadyCallbacks];
      layoutReadyCallbacks.length = 0;
      for (const callback of callbacks) callback();
    },
    runCodeBlockProcessor(language, source, sourcePath = "Some/Note.md") {
      const handler = codeBlockProcessors.get(language);
      if (!handler) throw new Error(`No processor registered for "${language}"`);
      const element = document.createElement("div");
      let attached: MarkdownRenderChild | undefined;
      const context: MarkdownPostProcessorContext = {
        docId: "fake-doc",
        sourcePath,
        frontmatter: null,
        addChild(child) {
          attached = child;
          child.load();
        },
        getSectionInfo() {
          return null;
        },
      };
      void handler(source, element, context);
      return { el: element, ctx: context, child: attached };
    },
  };
}
