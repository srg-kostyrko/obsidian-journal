import { createNanoEvents } from "nanoevents";
import { Menu, TFile } from "obsidian";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { AsyncResult, InvariantError, None, Some } from "@/infrastructure/result";
import type { Option } from "@/infrastructure/result";
import { icons } from "@/ui/icons";

import { WorkspaceOpenError } from "../errors";
import { SuggestCancelled } from "../suggests/errors";

import { buildMarkdownLink } from "./markdown-link";
import { toPaneType } from "./obsidian-bridge";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { MenuItemSpec, OpenMode, VaultPath, WorkspaceEvents } from "../types";
import type { Editor, MarkdownView, WorkspaceLeaf } from "obsidian";

// Obsidian exposes link-preference settings only through the untyped Vault.getConfig.
interface ConfigurableVault {
  getConfig?(key: string): unknown;
}

// The confirm-and-delete prompt is an undocumented FileManager method (same one core
// file-explorer menus use) — used below to give the appended Delete item the native
// confirm-before-delete behavior.
interface DeletePromptingFileManager {
  promptForFileDeletion?(file: TFile): void;
}

// Declaring the section order is also undocumented, though core calls it on every file menu
// it builds before triggering the event.
interface SectionedMenu {
  addSections?(sections: readonly string[]): void;
}

// Obsidian sorts a menu by section on show, and items carrying no section sink below every
// registered one — so without this our contributed items landed under the trailing Delete.
// This is core's own file-explorer order, "" being the slot those section-less items take.
const FILE_MENU_SECTIONS = [
  "title",
  "open",
  "action-primary",
  "action",
  "info",
  "info.copy",
  "view",
  "system",
  "",
  "danger",
];

export class WorkspaceService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #emitter: TypedEmitter<WorkspaceEvents> = createNanoEvents();

  readonly events: Subscribable<WorkspaceEvents> = this.#emitter;

  constructor() {
    this.#plugin.registerEvent(
      this.#app.workspace.on("active-leaf-change", (leaf) => {
        // Focusing a leaf with no file (e.g. the calendar sidebar) must not clear the active
        // note, or the calendar's active-day highlight would disappear whenever that sidebar
        // gets focus. Only react to leaves that carry a file; note closes leave the last note
        // active.
        const file = this.#fileOf(leaf);
        if (!file) return;
        this.#emitter.emit("active-note-changed", this.#pathOf(file));
      }),
    );
    // Same-leaf navigation (a link click, open-in-place) fires file-open without an
    // active-leaf-change; both feed the active-note signal.
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

  // An existing file goes through Obsidian's own generator; a target that does not exist yet is
  // linked by its full path so following the link creates the note where the journal expects it.
  #noteLink(targetPath: VaultPath): string {
    const target = this.#app.vault.getAbstractFileByPath(targetPath);
    if (target instanceof TFile) {
      const sourcePath = this.activeNote().getOr("" as VaultPath);
      return this.#app.fileManager.generateMarkdownLink(target, sourcePath);
    }
    return buildMarkdownLink({
      pathWithoutExtension: targetPath.replace(/\.md$/, ""),
      basename: (targetPath.split("/").pop() ?? targetPath).replace(/\.md$/, ""),
      useMarkdownLinks: this.#vaultConfig("useMarkdownLinks") === true,
    });
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

  // Returns whether the file resolved and the menu was populated, so a caller building a
  // combined menu can decline to show an empty one.
  openFileMenu(path: VaultPath, event: MouseEvent, into?: Menu): boolean {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    const menu = into ?? new Menu();
    (menu as SectionedMenu).addSections?.(FILE_MENU_SECTIONS);
    this.#app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
    // The file-menu event does not guarantee a Delete entry, so append one explicitly.
    menu.addItem((item) =>
      item
        .setTitle(m.common_action_delete())
        .setIcon(icons.action.delete)
        // Obsidian's own file menus put deletion in the trailing danger section and paint it
        // with the error color; matching that keeps our menu indistinguishable from a core one.
        .setSection("danger")
        .setWarning(true)
        .onClick(() => {
          (this.#app.fileManager as DeletePromptingFileManager).promptForFileDeletion?.(file);
        }),
    );
    // A menu we were handed belongs to the caller, who decides when to show it.
    if (!into) menu.showAtMouseEvent(event);
    return true;
  }

  openPathsMenu(paths: readonly VaultPath[], event: MouseEvent, extraItems: readonly MenuItemSpec[] = []): void {
    const [first] = paths;
    if (first === undefined && extraItems.length === 0) return;

    const menu = new Menu();
    for (const spec of extraItems) {
      menu.addItem((item) => item.setTitle(spec.title).setIcon(spec.icon).onClick(spec.onClick));
    }

    if (first !== undefined) {
      if (paths.length === 1) {
        // A stale index path that no longer resolves to a file must not surface an empty
        // popup where the pre-refactor code showed nothing; only the caller's own extras
        // (if any) justify still opening the menu.
        const populated = this.openFileMenu(first, event, menu);
        if (!populated && extraItems.length === 0) return;
      } else {
        for (const path of paths) {
          menu.addItem((item) => item.setTitle(path).onClick(() => this.openFileMenu(path, event)));
        }
      }
    }

    menu.showAtMouseEvent(event);
  }

  // A pick-one menu at the pointer, for disambiguating when multiple journals apply.
  // Cancellation is decided a task later than onHide because Obsidian can hide the menu
  // before the clicked item's handler runs — the same ordering hazard as SuggestModal.onClose.
  pickFromMenu(labels: readonly string[], event: MouseEvent): AsyncResult<string, SuggestCancelled> {
    return AsyncResult.fromPromise(
      new Promise<string>((resolve, reject) => {
        const menu = new Menu();
        let chosen = false;
        for (const label of labels) {
          menu.addItem((item) =>
            item.setTitle(label).onClick(() => {
              chosen = true;
              resolve(label);
            }),
          );
        }
        menu.onHide(() => {
          window.setTimeout(() => {
            if (!chosen) reject(new SuggestCancelled());
          }, 0);
        });
        menu.showAtMouseEvent(event);
      }),
      (cause) => (cause instanceof SuggestCancelled ? cause : new SuggestCancelled()),
    );
  }

  // Callers gate this behind useModifierHoverPreview, which also covers a modifier
  // pressed while already hovering (the stored enter event carries no modifier flags).
  previewFirstPath(paths: readonly VaultPath[], event: MouseEvent): void {
    const [first] = paths;
    if (first === undefined) return;
    this.triggerHoverPreview(first, event);
  }
}
