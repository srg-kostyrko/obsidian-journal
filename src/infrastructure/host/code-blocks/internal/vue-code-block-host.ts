import { MarkdownRenderChild } from "obsidian";
import { type App as VueApp, createApp, type Component } from "vue";

import { provideInjectorOnApp } from "@/infrastructure/di";
import type { Injector } from "@/infrastructure/di";

export class VueCodeBlockHost extends MarkdownRenderChild {
  readonly #injector: Injector;
  readonly #component: Component;
  readonly #props: Record<string, unknown>;
  readonly #cssClass: readonly string[];
  readonly #notice: string | undefined;
  #vueApp: VueApp | undefined;

  constructor(
    element: HTMLElement,
    injector: Injector,
    component: Component,
    props: Record<string, unknown>,
    cssClass: readonly string[] = [],
    notice?: string,
  ) {
    super(element);
    this.#injector = injector;
    this.#component = component;
    this.#props = props;
    this.#cssClass = cssClass;
    this.#notice = notice;
  }

  onload(): void {
    for (const cls of this.#cssClass) this.containerEl.classList.add(cls);
    if (this.#notice !== undefined) {
      const notice = activeDocument.createElement("div");
      notice.className = "code-block-notice";
      notice.textContent = this.#notice;
      this.containerEl.append(notice);
    }
    // Vue replaces its mount target's children, so the block mounts into its own child and the
    // notice above survives. The css classes stay on containerEl, where they always were.
    const mountPoint = activeDocument.createElement("div");
    this.containerEl.append(mountPoint);
    const app = createApp(this.#component, this.#props);
    provideInjectorOnApp(app, this.#injector);
    this.#vueApp = app;
    app.mount(mountPoint);
  }

  onunload(): void {
    this.#vueApp?.unmount();
    this.#vueApp = undefined;
    this.containerEl.replaceChildren();
  }
}
