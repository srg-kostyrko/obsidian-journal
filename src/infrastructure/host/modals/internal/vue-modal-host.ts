import { Modal } from "obsidian";
import { type App as VueApp, createApp } from "vue";

import { provideInjectorOnApp } from "@/infrastructure/di";
import type { Injector } from "@/infrastructure/di";

import { ModalContextKey } from "./modal-context";

import type { ModalApi, ModalDefinition } from "../types";
import type { App } from "obsidian";

export type ModalOutcomeHandler<TResult> = (outcome: { kind: "submit"; value: TResult } | { kind: "cancel" }) => void;

export class VueModalHost<TProps, TResult> extends Modal {
  readonly #definition: ModalDefinition<TProps, TResult>;
  readonly #props: TProps;
  readonly #injector: Injector;
  readonly #onOutcome: ModalOutcomeHandler<TResult>;
  #vueApp: VueApp | undefined;
  #settled = false;

  onAfterClose: (() => void) | undefined;

  constructor(
    app: App,
    injector: Injector,
    definition: ModalDefinition<TProps, TResult>,
    props: TProps,
    onOutcome: ModalOutcomeHandler<TResult>,
  ) {
    super(app);
    this.#definition = definition;
    this.#props = props;
    this.#injector = injector;
    this.#onOutcome = onOutcome;
  }

  #settle(outcome: { kind: "submit"; value: TResult } | { kind: "cancel" }): void {
    if (this.#settled) return;
    this.#settled = true;
    this.#onOutcome(outcome);
    // Defer close so submit/cancel called inside setup() doesn't re-enter Vue's mount cycle.
    queueMicrotask(() => {
      if (this.#vueApp) this.close();
    });
  }

  onOpen(): void {
    this.titleEl.textContent = this.#definition.title(this.#props);
    if (this.#definition.width !== undefined) {
      this.modalEl.style.setProperty("--dialog-width", `${this.#definition.width(this.#props)}px`);
    }
    for (const cssClass of this.#definition.cssClass) this.modalEl.classList.add(cssClass);

    const api: ModalApi<TResult> = {
      submit: (value) => this.#settle({ kind: "submit", value }),
      cancel: () => this.#settle({ kind: "cancel" }),
    };

    const app = createApp(this.#definition.component, this.#props as Record<string, unknown>);
    provideInjectorOnApp(app, this.#injector);
    app.provide(ModalContextKey, api as ModalApi<unknown>);
    this.#vueApp = app;
    app.mount(this.contentEl);
  }

  onClose(): void {
    this.#vueApp?.unmount();
    this.#vueApp = undefined;
    this.contentEl.replaceChildren();
    if (!this.#settled) this.#settle({ kind: "cancel" });
    this.onAfterClose?.();
  }

  dismiss(): void {
    this.close();
  }
}
