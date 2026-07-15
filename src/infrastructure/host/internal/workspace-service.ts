import { createNanoEvents } from "nanoevents";
import { Menu, TFile } from "obsidian";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { AsyncResult, InvariantError, None, Some } from "@/infrastructure/result";
import type { Option } from "@/infrastructure/result";
import { icons } from "@/ui/icons";

import { WorkspaceOpenError } from "../errors";

import { buildMarkdownLink, type NewLinkFormat } from "./markdown-link";
import { toPaneType } from "./obsidian-bridge";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { OpenMode, VaultPath, WorkspaceEvents } from "../types";
import type { Editor, MarkdownView, WorkspaceLeaf } from "obsidian";

// Obsidian exposes link-preference settings only through the untyped Vault.getConfig.
interface ConfigurableVault {
  getConfig?(key: string): unknown;
}

// The confirm-and-delete prompt is an undocumented FileManager method (same one core
// file-explorer menus use); v2 relied on it for the appended Delete item.
interface DeletePromptingFileManager {
  promptForFileDeletion?(file: TFile): void;
}

export class WorkspaceService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #emitter: TypedEmitter<WorkspaceEvents> = createNanoEvents();

  readonly events: Subscribable<WorkspaceEvents> = this.#emitter;

  constructor() {
    this.#plugin.registerEvent(
      this.#app.workspace.on("active-leaf-change", (leaf) => {
        this.#emitter.emit("active-note-changed", this.#pathOf(this.#fileOf(leaf)));
      }),
    );
    // Same-leaf navigation (a link click, open-in-place) fires file-open without an
    // active-leaf-change; both feed the active-note signal (v2 tracked file-open).
    this.#plugin.registerEvent(
      this.#app.workspace.on("file-open", (file) => {
        this.#emitter.emit("active-note-changed", this.#pathOf(file));
      }),
    );
  }

  async #open(path: VaultPath, mode: OpenMode): Promise<void> {
    const existing = this.#findOpenLeaf(path);
    if (existing) {
      this.#app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new InvariantError(`not a file: ${path}`);
    await this.#app.workspace.getLeaf(toPaneType(mode)).openFile(file, { active: true });
  }

  #findOpenLeaf(path: VaultPath): WorkspaceLeaf | null {
    for (const leaf of this.#app.workspace.getLeavesOfType("markdown")) {
      const file = this.#fileOf(leaf);
      if (file?.path === path) return leaf;
    }
    return null;
  }

  #activeEditor(): Editor | undefined {
    return this.#app.workspace.activeEditor?.editor;
  }

  // Honors the vault's link preferences for a target that may not exist yet: an existing file goes
  // through Obsidian's own generator; otherwise the format is reconstructed from the link settings.
  #noteLink(targetPath: VaultPath): string {
    const sourcePath = this.activeNote().getOr("" as VaultPath);
    const target = this.#app.vault.getAbstractFileByPath(targetPath);
    if (target instanceof TFile) {
      return this.#app.fileManager.generateMarkdownLink(target, sourcePath);
    }
    const basename = (targetPath.split("/").pop() ?? targetPath).replace(/\.md$/, "");
    const resolved = this.#app.metadataCache.getFirstLinkpathDest(basename, sourcePath);
    return buildMarkdownLink({
      pathWithoutExtension: targetPath.replace(/\.md$/, ""),
      basename,
      useMarkdownLinks: this.#vaultConfig("useMarkdownLinks") === true,
      format: this.#newLinkFormat(),
      ambiguous: resolved !== null && (resolved.path as VaultPath) !== targetPath,
    });
  }

  #newLinkFormat(): NewLinkFormat {
    const raw = this.#vaultConfig("newLinkFormat");
    return raw === "absolute" || raw === "relative" ? raw : "shortest";
  }

  #vaultConfig(key: string): unknown {
    return (this.#app.vault as unknown as ConfigurableVault).getConfig?.(key);
  }

  #fileOf(leaf: WorkspaceLeaf | null): TFile | null {
    const view = leaf?.view as MarkdownView | undefined;
    return view?.file ?? null;
  }

  #pathOf(file: TFile | null): Option<VaultPath> {
    if (!(file instanceof TFile)) return new None<VaultPath>();
    return new Some<VaultPath>(file.path as VaultPath);
  }

  activeNote(): Option<VaultPath> {
    return this.#pathOf(this.#app.workspace.getActiveFile());
  }

  get layoutReady(): boolean {
    return this.#app.workspace.layoutReady;
  }

  onLayoutReady(callback: () => void): void {
    this.#app.workspace.onLayoutReady(callback);
  }

  isOpen(path: VaultPath): boolean {
    return this.#findOpenLeaf(path) !== null;
  }

  openNote(path: VaultPath, mode: OpenMode = "active"): AsyncResult<void, WorkspaceOpenError> {
    return AsyncResult.fromPromise(this.#open(path, mode), (cause) => new WorkspaceOpenError(path, cause));
  }

  hasActiveEditor(): boolean {
    return this.#activeEditor() !== undefined;
  }

  insertNoteLinkAtCursor(targetPath: VaultPath): boolean {
    const editor = this.#activeEditor();
    if (editor === undefined) return false;
    editor.replaceSelection(this.#noteLink(targetPath));
    return true;
  }

  triggerHoverPreview(path: VaultPath, event: MouseEvent): void {
    this.#app.workspace.trigger("link-hover", this.#plugin, event.target, path, path);
  }

  openFileMenu(path: VaultPath, event: MouseEvent): void {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const menu = new Menu();
    this.#app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
    // The file-menu event does not guarantee a Delete entry; append one like v2 did.
    menu.addItem((item) =>
      item
        .setTitle(m.common_action_delete())
        .setIcon(icons.action.delete)
        .onClick(() => {
          (this.#app.fileManager as DeletePromptingFileManager).promptForFileDeletion?.(file);
        }),
    );
    menu.showAtMouseEvent(event);
  }

  openPathsMenu(paths: readonly VaultPath[], event: MouseEvent): void {
    const [first] = paths;
    if (first === undefined) return;
    if (paths.length === 1) {
      this.openFileMenu(first, event);
      return;
    }
    const menu = new Menu();
    for (const path of paths) {
      menu.addItem((item) => item.setTitle(path).onClick(() => this.openFileMenu(path, event)));
    }
    menu.showAtMouseEvent(event);
  }

  previewFirstPath(paths: readonly VaultPath[], event: MouseEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    const [first] = paths;
    if (first === undefined) return;
    this.triggerHoverPreview(first, event);
  }
}
