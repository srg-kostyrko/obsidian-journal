import type { VueApp as VueAppContract } from "./vue.types";
import { RootComponent, RootElement, VueAppInjector, VueApp as VueAppToken } from "./vue.tokens";
import { Injectable } from "../di/decorators/Injectable";
import { createApp, type App } from "vue";
import { inject } from "../di/inject";
import { Injector } from "../di/injector";
import { Scoped } from "../di/decorators/Scoped";
import { Scope } from "../di/contracts/scope.types";

export
@Injectable(VueAppToken)
@Scoped(Scope.Transient)
class VueApp implements VueAppContract {
  #vueApp: App | null = null;

  #injector = inject(Injector);
  #rootComponent = inject(RootComponent);
  #rootElement = inject(RootElement);

  mount(): void {
    this.#vueApp = createApp(this.#rootComponent);
    this.#vueApp.provide(VueAppInjector, this.#injector);
    this.#vueApp.mount(this.#rootElement);
  }
  unmount(): void {
    this.#vueApp?.unmount();
    this.#vueApp = null;
    this.#rootElement.empty();
  }
}
