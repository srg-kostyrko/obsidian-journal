import { ItemView, type WorkspaceLeaf } from "obsidian";
import * as v from "valibot";
import { computed, createApp, defineComponent, h, reactive, type App as VueApp, type VNode } from "vue";

import { CalendarDate } from "@/calendar/calendar-date";
import type { AnchorString } from "@/calendar/types";
import { provideInjectorOnApp, type Injector } from "@/infrastructure/di";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { FALLBACK_VIEW_ICON, type ViewId } from "./config";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
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
    return { ...this.#state };
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
      const logger = injector.resolve(LoggerFactoryToken).named("view-leaf");

      const view = computed(() => repo.get(viewId).match({ some: (current) => current, none: () => null }));

      const context: ViewContext = {
        viewId,
        viewName: computed(() => view.value?.name ?? ""),
        refDate: computed(() => leafState.refDate ?? todayAnchor()),
        shelf: computed(() => leafState.shelf ?? view.value?.defaultShelf ?? null),
        preview: false,
        setRefDate: (date) => {
          leafState.refDate = date;
        },
        setShelf: (shelf) => {
          leafState.shelf = shelf;
        },
      };
      provideViewContext(context);

      return () => {
        const current = view.value;
        if (!current) return h("div", { class: "journal-view-deleted" }, "View was deleted");
        const children: (VNode | null)[] = current.blocks.map((block) => {
          const definition = service.getBlockDefinition(block.key).match({
            some: (d) => d,
            none: () => null,
          });
          if (!definition) {
            logger.warn("unknown view-block key", { key: block.key, viewId });
            return null;
          }
          const parsed = v.safeParse(definition.schema, block.config);
          if (!parsed.success) {
            logger.warn("invalid view-block config", { key: block.key, viewId, blockId: block.id });
            return null;
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
