import { ItemView, type WorkspaceLeaf } from "obsidian";
import { match } from "ts-pattern";

import { inject, InjectorToken } from "@/infrastructure/di";
import { CommandService } from "@/infrastructure/host/commands";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken, type Logger } from "@/infrastructure/logger";

import { ViewsRepository } from "./repository";
import { ViewsEventsToken } from "./tokens";
import { JournalViewLeaf } from "./view-leaf";

import type { View, ViewId } from "./config";

type Disposer = () => void;

export class ViewHostService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #commands = inject(CommandService);
  readonly #repo = inject(ViewsRepository);
  readonly #events = inject(ViewsEventsToken);
  readonly #logger = inject(LoggerFactoryToken).named("view-host");
  readonly #injector = inject(InjectorToken);
  readonly #disposers = new Map<ViewId, Disposer>();
  readonly #stale = new Set<string>();

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

  dispose(): void {
    for (const [, disposeOne] of this.#disposers) disposeOne();
    this.#disposers.clear();
  }

  initialize(): void {
    const appStartup = !this.#app.workspace.layoutReady;
    this.#app.workspace.onLayoutReady(() => {
      if (!appStartup) return;
      void this.#openStartupViews();
    });
  }

  async #openStartupViews(): Promise<void> {
    for (const [id, view] of this.#repo.find().entries()) {
      if (!view.openOnStartup) continue;
      try {
        await this.open(id);
      } catch (error) {
        this.#logger.error("failed to open view on startup", { id, error });
      }
    }
  }

  #registerAll(): void {
    for (const [id] of this.#repo.find().entries()) this.#register(id);
  }

  #register(id: ViewId): void {
    if (this.#disposers.has(id)) return;
    const view = this.#getView(id);
    if (!view) {
      this.#logger.warn("register called for unknown view", { id });
      return;
    }
    const viewType = viewTypeOf(id);
    this.#plugin.registerView(viewType, (leaf) => this.#buildLeaf(leaf, id, viewType));
    this.#commands.register(this.#commandDescriptorFor(id, view));
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
    const view = this.#getView(id);
    if (!view) return;
    this.#commands.unregister(commandIdOf(id));
    this.#commands.register(this.#commandDescriptorFor(id, view));
  }

  #tearDown(id: ViewId, viewType: string): void {
    this.#app.workspace.detachLeavesOfType(viewType);
    this.#commands.unregister(commandIdOf(id));
    // Obsidian has no API to revoke registerView; mark the type so any future
    // factory invocation (e.g. a stale layout reopens) renders an empty leaf.
    this.#stale.add(viewType);
  }

  #getView(id: ViewId): View | null {
    return this.#repo.get(id).match({ some: (v) => v, none: () => null });
  }

  #commandDescriptorFor(id: ViewId, view: View) {
    return {
      id: commandIdOf(id),
      name: `Open ${view.name}`,
      icon: view.icon,
      ribbon: view.showInRibbon,
      execute: () => void this.open(id),
    };
  }

  #buildLeaf(leaf: WorkspaceLeaf, id: ViewId, viewType: string): ItemView {
    if (this.#stale.has(viewType)) {
      return new StaleLeaf(leaf, viewType, this.#logger);
    }
    return new JournalViewLeaf(leaf, id, this.#injector);
  }

  async open(id: ViewId): Promise<void> {
    const viewType = viewTypeOf(id);
    const [existing] = this.#app.workspace.getLeavesOfType(viewType);
    if (existing) {
      await this.#app.workspace.revealLeaf(existing);
      return;
    }
    const view = this.#getView(id);
    const leaf = this.#leafFor(view?.leaf ?? "right");
    await leaf.setViewState({ type: viewType, active: true });
    await this.#app.workspace.revealLeaf(leaf);
  }

  #leafFor(placement: View["leaf"]): WorkspaceLeaf {
    const leaf = match(placement)
      .with("left", () => this.#app.workspace.getLeftLeaf(false))
      .with("right", () => this.#app.workspace.getRightLeaf(false))
      .with("tab", () => null)
      .exhaustive();
    return leaf ?? this.#app.workspace.getLeaf(true);
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
