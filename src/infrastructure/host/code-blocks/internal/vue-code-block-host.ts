import { MarkdownRenderChild } from "obsidian";
import { type App as VueApp, createApp, type Component } from "vue";

import { provideInjectorOnApp } from "@/infrastructure/di";
import type { Injector } from "@/infrastructure/di";

export class VueCodeBlockHost extends MarkdownRenderChild {
  readonly #injector: Injector;
  readonly #component: Component;
  readonly #props: Record<string, unknown>;
  readonly #cssClass: readonly string[];
  #vueApp: VueApp | undefined;

  constructor(
    element: HTMLElement,
    injector: Injector,
    component: Component,
    props: Record<string, unknown>,
    cssClass: readonly string[] = [],
  ) {
    super(element);
    this.#injector = injector;
    this.#component = component;
    this.#props = props;
    this.#cssClass = cssClass;
  }

  onload(): void {
    for (const cls of this.#cssClass) this.containerEl.classList.add(cls);
    const app = createApp(this.#component, this.#props);
    provideInjectorOnApp(app, this.#injector);
    this.#vueApp = app;
    app.mount(this.containerEl);
  }

  onunload(): void {
    this.#vueApp?.unmount();
    this.#vueApp = undefined;
    this.containerEl.replaceChildren();
  }
}
