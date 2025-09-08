import { Injectable } from "@/infra/di/decorators/Injectable";
import { JournalPlugin, ObsidianApp, Workspace as WorkspaceToken } from "./obsidian.tokens";
import { inject } from "@/infra/di/inject";
import { Option } from "@/infra/data-structures/option";
import type { LeafType, Workspace } from "./contracts/workspace.types";
import { Result, type AsyncResult } from "@/infra/data-structures/result";
import { type WorkspaceLeaf, type PaneType, Menu, type MarkdownView, type Side } from "obsidian";
import { FilePath } from "./contracts/vault.types";
import { WorkspaceError } from "./errors/workspace.error";
import { ref } from "vue";
import { Logger } from "@/infra/logger/logger.tokens";

export
@Injectable(WorkspaceToken)
class WorkspaceAdapter implements Workspace {
  #app = inject(ObsidianApp);
  #plugin = inject(JournalPlugin);
  #logger = inject(Logger, "WorkspaceAdapter");

  #layoutReady = Promise.withResolvers<void>();

  #activeFile = ref<FilePath | null>(null);

  constructor() {
    this.#app.workspace.onLayoutReady(() => {
      const activeFile = this.#app.workspace.getActiveFile();
      if (activeFile) this.#activeFile.value = FilePath(activeFile.path);

      this.#plugin.registerEvent(
        this.#app.workspace.on(
          "file-open",
          (file) => (this.#activeFile.value = file?.path ? FilePath(file.path) : null),
        ),
      );

      this.#layoutReady.resolve();
    });
  }

  get isLayoutReady() {
    return this.#app.workspace.layoutReady;
  }

  get layoutReady() {
    return this.#layoutReady.promise;
  }

  get activeFile() {
    return Option.fromNullable(this.#activeFile.value);
  }

  getLeavesOfType(type: LeafType): WorkspaceLeaf[] {
    return this.#app.workspace.getLeavesOfType(type);
  }

  getLeafOfType(type: LeafType): Option<WorkspaceLeaf> {
    return Option.fromNullable(this.#app.workspace.getLeavesOfType(type).at(0));
  }

  getLeaf(newLeaf?: PaneType | boolean): WorkspaceLeaf {
    return this.#app.workspace.getLeaf(newLeaf);
  }

  setActiveLeaf(leaf: WorkspaceLeaf, focus = true): void {
    this.#app.workspace.setActiveLeaf(leaf, { focus });
  }

  ensureSideLeaf(type: LeafType, side: Side): AsyncResult<WorkspaceLeaf, WorkspaceError> {
    return Result.try(
      async () => {
        return await this.#app.workspace.ensureSideLeaf(type, side, { active: true, reveal: true });
      },
      (error) => WorkspaceError.fromCatch(error),
    ).tapErr((error) => this.#logger.error(error.message, { error }));
  }

  detachLeavesOfType(type: LeafType): void {
    this.#app.workspace.detachLeavesOfType(type);
  }

  findOpenedNote(path: FilePath): Option<WorkspaceLeaf> {
    return Option.fromNullable(
      this.#app.workspace.getLeavesOfType("markdown").find((leaf) => (leaf.view as MarkdownView).file?.path === path),
    );
  }

  showContextMenu(path: FilePath, event: MouseEvent): void {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (file) {
      const menu = new Menu();
      this.#app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
      menu.addItem((item) =>
        item
          .setTitle("Delete")
          .setIcon("trash")
          .onClick(() => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
            (this.#app.fileManager as any).promptForFileDeletion(file);
          }),
      );
      menu.showAtMouseEvent(event);
    }
  }

  showPreview(path: FilePath, event: MouseEvent): void {
    this.#app.workspace.trigger("link-hover", this.#plugin, event.target, path, path);
  }
}
