import { ItemView, type WorkspaceLeaf } from "obsidian";

import { inject, type Container } from "@/infrastructure/di";
import { CommandService } from "@/infrastructure/host/commands";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken, type Logger } from "@/infrastructure/logger";

import { ViewsRepository } from "./repository";
import { ViewsEventsToken } from "./tokens";
import { JournalViewLeaf } from "./view-leaf";

import type { ViewId } from "./config";

type Disposer = () => void;

export class ViewHostService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #commands = inject(CommandService);
  readonly #repo = inject(ViewsRepository);
  readonly #events = inject(ViewsEventsToken);
  readonly #logger = inject(LoggerFactoryToken).named("view-host");
  readonly #disposers = new Map<ViewId, Disposer>();
  readonly #stale = new Set<string>();
  #container: Container | null = null;

  constructor() {
    this.#events.on("created", (id) => {
      this.#register(id);
    });
    this.#events.on("deleted", (id) => {
      this.#disposeOne(id);
    });
    this.#events.on("updated", (id) => {
      this.#resync(id);
    });
    this.#plugin.register(() => {
      this.dispose();
    });
    this.#registerAll();
  }

  // Container can't self-inject without a circular DI dependency at boot;
  // module wiring sets it on the eagerly-resolved instance via autoLoad.
  setContainer(container: Container): void {
    this.#container = container;
  }

  dispose(): void {
    for (const [, disposeOne] of this.#disposers) disposeOne();
    this.#disposers.clear();
  }

  #registerAll(): void {
    for (const [id] of this.#repo.find().entries()) this.#register(id);
  }

  #register(id: ViewId): void {
    if (this.#disposers.has(id)) return;
    const view = this.#repo.get(id).match({ some: (v) => v, none: () => null });
    if (!view) {
      this.#logger.warn("register called for unknown view", { id });
      return;
    }
    const viewType = viewTypeOf(id);
    this.#plugin.registerView(viewType, (leaf) => this.#buildLeaf(leaf, id, viewType));
    this.#commands.register({
      id: commandIdOf(id),
      name: `Open ${view.name}`,
      icon: view.icon,
      ribbon: view.showInRibbon,
      execute: () => {
        void this.#open(id);
      },
    });
    this.#disposers.set(id, () => {
      this.#tearDown(id, viewType);
    });
  }

  #disposeOne(id: ViewId): void {
    const disposeOne = this.#disposers.get(id);
    if (!disposeOne) return;
    disposeOne();
    this.#disposers.delete(id);
  }

  #resync(id: ViewId): void {
    if (!this.#disposers.has(id)) return;
    const view = this.#repo.get(id).match({ some: (v) => v, none: () => null });
    if (!view) return;
    const commandId = commandIdOf(id);
    this.#commands.unregister(commandId);
    this.#commands.register({
      id: commandId,
      name: `Open ${view.name}`,
      icon: view.icon,
      ribbon: view.showInRibbon,
      execute: () => {
        void this.#open(id);
      },
    });
  }

  #tearDown(id: ViewId, viewType: string): void {
    this.#app.workspace.detachLeavesOfType(viewType);
    this.#commands.unregister(commandIdOf(id));
    // Obsidian has no API to revoke registerView; mark the type so any future
    // factory invocation (e.g. a stale layout reopens) renders an empty leaf.
    this.#stale.add(viewType);
  }

  #buildLeaf(leaf: WorkspaceLeaf, id: ViewId, viewType: string): ItemView {
    if (this.#stale.has(viewType) || !this.#container) {
      return new StaleLeaf(leaf, viewType, this.#logger);
    }
    return new JournalViewLeaf(leaf, id, this.#container);
  }

  async #open(id: ViewId): Promise<void> {
    const leaf = this.#app.workspace.getLeaf(true);
    await leaf.setViewState({ type: viewTypeOf(id), active: true });
  }
}

function viewTypeOf(id: ViewId): string {
  return `journal-view:${id}`;
}

function commandIdOf(id: ViewId): string {
  return `journal:open-view:${id}`;
}

class StaleLeaf extends ItemView {
  readonly #viewType: string;
  readonly #logger: Logger;

  constructor(leaf: WorkspaceLeaf, viewType: string, logger: Logger) {
    super(leaf);
    this.#viewType = viewType;
    this.#logger = logger;
  }

  getViewType(): string {
    return this.#viewType;
  }

  getDisplayText(): string {
    return "Stale view";
  }

  protected onOpen(): Promise<void> {
    this.#logger.warn("opened stale view", { viewType: this.#viewType });
    return Promise.resolve();
  }
}
