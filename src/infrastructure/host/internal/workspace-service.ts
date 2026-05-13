import { createNanoEvents } from "nanoevents";
import { TFile } from "obsidian";

import { inject } from "@/infrastructure/di";
import { AsyncResult, InvariantError, None, Some } from "@/infrastructure/result";
import type { Option } from "@/infrastructure/result";

import { WorkspaceOpenError } from "../errors";

import { toPaneType } from "./obsidian-bridge";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { OpenMode, Subscribable, VaultPath, WorkspaceEvents } from "../types";
import type { MarkdownView, WorkspaceLeaf } from "obsidian";

interface TypedEmitter {
  on<K extends keyof WorkspaceEvents>(event: K, callback: WorkspaceEvents[K]): () => void;
  emit<K extends keyof WorkspaceEvents>(event: K, ...arguments_: Parameters<WorkspaceEvents[K]>): void;
}

export class WorkspaceService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #emitter: TypedEmitter = createNanoEvents();

  readonly events: Subscribable<WorkspaceEvents> = this.#emitter;

  constructor() {
    this.#plugin.registerEvent(
      this.#app.workspace.on("active-leaf-change", (leaf) => {
        this.#emitter.emit("active-note-changed", this.#pathOf(this.#fileOf(leaf)));
      }),
    );
  }

  activeNote(): Option<VaultPath> {
    return this.#pathOf(this.#app.workspace.getActiveFile());
  }

  isOpen(path: VaultPath): boolean {
    return this.#findOpenLeaf(path) !== null;
  }

  openNote(path: VaultPath, mode: OpenMode = "active"): AsyncResult<void, WorkspaceOpenError> {
    return AsyncResult.fromPromise(this.#open(path, mode), (cause) => new WorkspaceOpenError(path, cause));
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

  #fileOf(leaf: WorkspaceLeaf | null): TFile | null {
    const view = leaf?.view as MarkdownView | undefined;
    return view?.file ?? null;
  }

  #pathOf(file: TFile | null): Option<VaultPath> {
    if (!(file instanceof TFile)) return new None<VaultPath>();
    return new Some<VaultPath>(file.path as VaultPath);
  }
}
