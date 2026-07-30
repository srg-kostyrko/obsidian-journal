import { ItemView, type WorkspaceLeaf } from "obsidian";
import * as v from "valibot";
import { computed, createApp, defineComponent, h, reactive, shallowRef, type App as VueApp, type VNode } from "vue";

import { CalendarDate } from "@/calendar/calendar-date";
import type { AnchorString } from "@/calendar/types";
import { m } from "@/i18n";
import { provideInjectorOnApp, type Injector } from "@/infrastructure/di";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import { ShelvesRepository } from "@/shelves";

import { FALLBACK_VIEW_ICON, type ViewId } from "./config";
import { resolveLeafShelf } from "./leaf-shelf";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import ViewErrorPanel from "./ui/ViewErrorPanel.vue";
import { useFollowActiveNote } from "./use-follow-active-note";
import { provideViewContext, type ViewContext } from "./view-context";

interface JournalViewLeafState {
  refDate?: AnchorString;
  shelf?: string | null;
}

export class JournalViewLeaf extends ItemView {
  // reactive() so that closures in buildRootComponent hold the same object reference
  // across setState calls — Vue computed refs track property reads on the proxy.
  #state: JournalViewLeafState = reactive({});
  #vueApp: VueApp | null = null;

  // Calendar-type views opt out of navigation history (Obsidian convention, v2 parity).
  // Without it a tab-placed view leaf is treated as navigable and Obsidian may reuse or
  // replace it when a note opens; v2 was sidebar-only and immune by construction.
  navigation = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly viewId: ViewId,
    private readonly injector: Injector,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return `journal-view:${this.viewId}`;
  }

  getDisplayText(): string {
    return this.injector
      .resolve(ViewsRepository)
      .get(this.viewId)
      .match({ some: (view) => view.name, none: () => "Journal view" });
  }

  getIcon(): string {
    return this.injector
      .resolve(ViewsRepository)
      .get(this.viewId)
      .match({ some: (view) => view.icon || FALLBACK_VIEW_ICON, none: () => FALLBACK_VIEW_ICON });
  }

  getState(): Record<string, unknown> {
    const state = { ...this.#state };
    // Persist the viewed date across restarts only when the view opts in; otherwise a fresh
    // launch centers on today (v2 default). In-session navigation is unaffected — it reads
    // the live reactive state, not the serialized snapshot.
    const remembers = this.injector
      .resolve(ViewsRepository)
      .get(this.viewId)
      .match({ some: (view) => view.rememberDate, none: () => false });
    if (!remembers) delete state.refDate;
    return state;
  }

  // Entry point for the per-view change-shelf command: mutating the reactive leaf
  // state updates the mounted view's ViewContext.shelf, same as the toolbar selector.
  setShelf(shelf: string | null): void {
    this.#state.shelf = shelf;
  }

  setState(state: unknown, _result: unknown): Promise<void> {
    if (state && typeof state === "object") {
      // Obsidian sends the full persisted state (replace, not patch).
      // Mutate in-place so the reactive() proxy — and all closures captured in
      // buildRootComponent — observe the update without needing a new reference.
      for (const key of Object.keys(this.#state) as (keyof JournalViewLeafState)[]) {
        delete this.#state[key];
      }
      Object.assign(this.#state, state);
      this.injector.resolve(InternalObsidianAppToken).workspace.requestSaveLayout();
    }
    return Promise.resolve();
  }

  protected onOpen(): Promise<void> {
    const app = createApp(buildRootComponent(this.viewId, this.#state, this.injector));
    provideInjectorOnApp(app, this.injector);
    app.mount(this.contentEl);
    this.#vueApp = app;
    return Promise.resolve();
  }

  protected onClose(): Promise<void> {
    this.#vueApp?.unmount();
    this.#vueApp = null;
    this.contentEl.empty();
    return Promise.resolve();
  }
}

function todayAnchor(): AnchorString {
  return CalendarDate.today().toAnchor();
}

function buildRootComponent(viewId: ViewId, leafState: JournalViewLeafState, injector: Injector) {
  return defineComponent({
    setup() {
      const repo = injector.resolve(ViewsRepository);
      const service = injector.resolve(ViewsService);
      const shelves = injector.resolve(ShelvesRepository);
      const logger = injector.resolve(LoggerFactoryToken).named("view-leaf");

      const view = computed(() => repo.get(viewId).match({ some: (current) => current, none: () => null }));

      // Set only by the view-level follow writer (Task 2) and cleared by every explicit
      // navigation, so refDateOrigin can tell the two apart without a second date.
      const followedAnchor = shallowRef<AnchorString | null>(null);

      const context: ViewContext = {
        viewId,
        viewName: computed(() => view.value?.name ?? ""),
        refDate: computed(() => leafState.refDate ?? todayAnchor()),
        refDateOrigin: computed(() => (leafState.refDate === followedAnchor.value ? "follow" : "navigate")),
        shelf: computed(() =>
          resolveLeafShelf(leafState.shelf, view.value?.defaultShelf ?? null, (name) => shelves.get(name).isSome()),
        ),
        preview: false,
        setRefDate: (date) => {
          followedAnchor.value = null;
          leafState.refDate = date;
        },
        setShelf: (shelf) => {
          leafState.shelf = shelf;
        },
      };
      provideViewContext(context);

      const scope = useShelfScope(() => context.shelf.value);
      useFollowActiveNote({
        enabled: () => view.value?.followActiveDate ?? true,
        inScope: (name) => scope.all.value.includes(name),
        currentDate: () => context.refDate.value,
        onFollow: (date) => {
          followedAnchor.value = date;
          leafState.refDate = date;
        },
      });

      return () => {
        const current = view.value;
        if (!current) return h(ViewErrorPanel, { message: m.view_deleted_error() });
        const children: (VNode | null)[] = current.blocks.map((block) => {
          const definition = service.getBlockDefinition(block.key).match({
            some: (d) => d,
            none: () => null,
          });
          if (!definition) {
            logger.warn("unknown view-block key", { key: block.key, viewId });
            return h(ViewErrorPanel, { key: block.id, message: m.view_block_unknown_error() });
          }
          const parsed = v.safeParse(definition.schema, block.config);
          if (!parsed.success) {
            logger.warn("invalid view-block config", { key: block.key, viewId, blockId: block.id });
            return h(ViewErrorPanel, { key: block.id, message: m.view_block_config_error() });
          }
          return h(definition.component, {
            key: block.id,
            instanceId: block.id,
            config: parsed.output,
          });
        });
        return h("div", { class: "journal-view-root" }, children);
      };
    },
  });
}
