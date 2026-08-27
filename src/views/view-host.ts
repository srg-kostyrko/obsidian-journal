import { ItemView, type WorkspaceLeaf } from "obsidian";
import { match } from "ts-pattern";

import { m } from "@/i18n";
import { inject, InjectorToken } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { CommandService } from "@/infrastructure/host/commands";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { SuggestService } from "@/infrastructure/host/suggests";
import { LoggerFactoryToken, type Logger } from "@/infrastructure/logger";
import { shelfPickerSuggest, ShelvesRepository } from "@/shelves";

import { FALLBACK_VIEW_ICON, type View, type ViewId } from "./config";
import { DEFAULT_CALENDAR_VIEW_ID } from "./default-view";
import { ViewsRepository } from "./repository";
import { ViewsEventsToken } from "./tokens";
import { JournalViewLeaf } from "./view-leaf";

type Disposer = () => void;

export class ViewHostService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #app = inject(InternalObsidianAppToken);
  readonly #commands = inject(CommandService);
  readonly #repo = inject(ViewsRepository);
  readonly #shelves = inject(ShelvesRepository);
  readonly #suggests = inject(SuggestService);
  readonly #notices = inject(NoticeService);
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

  async #openStartupViews(): Promise<void> {
    for (const [id, view] of this.#repo.find().entries()) {
      if (!view.openOnStartup) continue;
      try {
        await this.#placeOnStartup(id);
      } catch (error) {
        this.#logger.error("failed to open view on startup", { id, error });
      }
    }
  }

  // Startup places the view without revealing it — a collapsed sidebar stays collapsed and
  // focus is not stolen. A leaf already restored from the persisted layout is left untouched;
  // only a genuinely missing one is placed (inactive). Explicit open commands still
  // reveal — see open().
  async #placeOnStartup(id: ViewId): Promise<void> {
    const viewType = viewTypeOf(id);
    if (this.#app.workspace.getLeavesOfType(viewType).length > 0) return;
    const view = this.#getView(id);
    const leaf = this.#leafFor(view?.leaf ?? "right");
    await leaf.setViewState({ type: viewType });
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
    this.#commands.register(this.#shelfCommandDescriptorFor(id, view));
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
    this.#commands.unregister(shelfCommandIdOf(id));
    this.#commands.register(this.#shelfCommandDescriptorFor(id, view));
    this.#refreshOpenHeaders(viewTypeOf(id));
  }

  #refreshOpenHeaders(viewType: string): void {
    for (const leaf of this.#app.workspace.getLeavesOfType(viewType)) {
      // updateHeader() is an undocumented Obsidian internal that makes an open leaf re-read
      // getIcon()/getDisplayText(), so icon/title edits show without reopening the tab.
      // Optional-call plus catch so a renamed or removed internal degrades to "updates on
      // next reopen" instead of throwing out of the settings update.
      try {
        (leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
      } catch (error) {
        this.#logger.warn("failed to refresh view leaf header", { viewType, error });
      }
    }
  }

  #tearDown(id: ViewId, viewType: string): void {
    this.#app.workspace.detachLeavesOfType(viewType);
    this.#commands.unregister(commandIdOf(id));
    this.#commands.unregister(shelfCommandIdOf(id));
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
      name: m.command_open_view({ name: view.name }),
      icon: view.icon || FALLBACK_VIEW_ICON,
      ribbon: view.showInRibbon,
      execute: () => void this.open(id),
    };
  }

  // Each view can show its own shelf, so shelf-picking is a per-view command: pick a shelf
  // (or all journals) from a suggest and apply it to this view's open leaves.
  #shelfCommandDescriptorFor(id: ViewId, view: View) {
    return {
      id: shelfCommandIdOf(id),
      name: m.command_view_change_shelf({ name: view.name }),
      icon: view.icon || FALLBACK_VIEW_ICON,
      ribbon: false,
      check: () => this.#shelves.count() > 0 && this.isOpen(id),
      // check only hides the command from the palette; a hotkey still reaches execute. Picking a
      // shelf for a view with no open leaf has nothing to apply it to, so say so rather than
      // doing nothing. Zero shelves is not a dead end — the picker still offers "all journals".
      execute: () => {
        if (!this.isOpen(id)) {
          this.#notices.show(m.command_view_shelf_needs_open_view({ name: view.name }));
          return;
        }
        void this.#pickShelf(id);
      },
    };
  }

  async #pickShelf(id: ViewId): Promise<void> {
    const allJournals = m.common_label_all_journals();
    const names = [allJournals, ...[...this.#shelves.find().list()].map((shelfConfig) => shelfConfig.name)];
    const choice = await this.#suggests.open(shelfPickerSuggest, names);
    if (choice.isErr()) return;
    const picked = choice.value === allJournals ? null : choice.value;
    const leaves = this.#app.workspace.getLeavesOfType(viewTypeOf(id));
    for (const leaf of leaves) {
      if (leaf.view instanceof JournalViewLeaf) leaf.view.setShelf(picked);
    }
  }

  #buildLeaf(leaf: WorkspaceLeaf, id: ViewId, viewType: string): ItemView {
    if (this.#stale.has(viewType)) {
      return new StaleLeaf(leaf, viewType, this.#logger);
    }
    return new JournalViewLeaf(leaf, id, this.#injector);
  }

  #leafFor(placement: View["leaf"]): WorkspaceLeaf {
    const leaf = match(placement)
      .with("left", () => this.#app.workspace.getLeftLeaf(false))
      .with("right", () => this.#app.workspace.getRightLeaf(false))
      .with("tab", () => null)
      .exhaustive();
    return leaf ?? this.#app.workspace.getLeaf(true);
  }

  dispose(): void {
    for (const [, disposeOne] of this.#disposers) disposeOne();
    this.#disposers.clear();
  }

  initialize(): void {
    this.#app.workspace.onLayoutReady(() => {
      void this.#openStartupViews();
    });
  }

  // Reveal makes the view visible (expanding a collapsed sidebar, selecting its tab) without
  // activating it. Activation focuses the leaf, and Obsidian closes an open settings window
  // whenever a leaf takes focus — which would dismiss the settings page a view is opened from.
  async open(id: ViewId): Promise<void> {
    const viewType = viewTypeOf(id);
    const [existing] = this.#app.workspace.getLeavesOfType(viewType);
    if (existing) {
      await this.#app.workspace.revealLeaf(existing);
      return;
    }
    const view = this.#getView(id);
    const leaf = this.#leafFor(view?.leaf ?? "right");
    await leaf.setViewState({ type: viewType });
    await this.#app.workspace.revealLeaf(leaf);
  }

  isOpen(id: ViewId): boolean {
    return this.#app.workspace.getLeavesOfType(viewTypeOf(id)).length > 0;
  }

  async reposition(id: ViewId): Promise<void> {
    const viewType = viewTypeOf(id);
    const count = this.#app.workspace.getLeavesOfType(viewType).length;
    if (count === 0) return;
    this.#app.workspace.detachLeavesOfType(viewType);
    const view = this.#getView(id);
    // Count is preserved only for the "tab" target, where each iteration mints a fresh leaf. Sidebar
    // placements reuse the single left/right leaf, so multiple leaves collapse to one — acceptable
    // because open() dedupes, making multi-leaf states rare.
    for (let index = 0; index < count; index++) {
      const leaf = this.#leafFor(view?.leaf ?? "right");
      await leaf.setViewState({ type: viewType });
      await this.#app.workspace.revealLeaf(leaf);
    }
  }
}

function viewTypeOf(id: ViewId): string {
  return `journal-view:${id}`;
}

// A fixed `open-calendar` command id predates per-view generated ids, and users may already
// have hotkeys bound to it. The seeded Calendar view owns that id as its own open command, so
// those hotkeys keep working without a second command shadowing it in the palette.
function commandIdOf(id: ViewId): string {
  if (id === DEFAULT_CALENDAR_VIEW_ID) return "open-calendar";
  return `open-view:${id}`;
}

function shelfCommandIdOf(id: ViewId): string {
  return `change-shelf:${id}`;
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
