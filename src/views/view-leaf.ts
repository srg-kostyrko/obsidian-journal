import { ItemView, type WorkspaceLeaf } from "obsidian";
import * as v from "valibot";
import { computed, createApp, defineComponent, h, type App as VueApp, type VNode } from "vue";

import { CalendarDate } from "@/calendar/calendar-date";
import type { AnchorString } from "@/calendar/types";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { provideViewContext, type ViewContext } from "./view-context";

import type { ViewId } from "./config";

interface JournalViewLeafState {
  refDate?: AnchorString;
  shelf?: string | null;
}

export class JournalViewLeaf extends ItemView {
  #state: JournalViewLeafState = {};
  #vueApp: VueApp | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly viewId: ViewId,
    private readonly container: Container,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return `journal-view:${this.viewId}`;
  }

  getDisplayText(): string {
    return this.container
      .resolve(ViewsRepository)
      .get(this.viewId)
      .match({ some: (view) => view.name, none: () => "Journal view" });
  }

  getIcon(): string {
    return this.container
      .resolve(ViewsRepository)
      .get(this.viewId)
      .match({ some: (view) => view.icon, none: () => "calendar-days" });
  }

  getState(): Record<string, unknown> {
    return { ...this.#state };
  }

  setState(state: unknown, _result: unknown): Promise<void> {
    if (state && typeof state === "object") {
      this.#state = { ...(state as JournalViewLeafState) };
      this.container.resolve(InternalObsidianAppToken).workspace.requestSaveLayout();
    }
    return Promise.resolve();
  }

  protected onOpen(): Promise<void> {
    const app = createApp(buildRootComponent(this.viewId, this.#state, this.container));
    provideInjectorOnApp(app, this.container);
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

function buildRootComponent(viewId: ViewId, leafState: JournalViewLeafState, container: Container) {
  return defineComponent({
    setup() {
      const repo = container.resolve(ViewsRepository);
      const service = container.resolve(ViewsService);
      const logger = container.resolve(LoggerFactoryToken).named("view-leaf");

      const view = computed(() => repo.get(viewId).match({ some: (current) => current, none: () => null }));

      const context: ViewContext = {
        viewId,
        viewName: computed(() => view.value?.name ?? ""),
        refDate: computed(() => leafState.refDate ?? todayAnchor()),
        shelf: computed(() => leafState.shelf ?? view.value?.defaultShelf ?? null),
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
