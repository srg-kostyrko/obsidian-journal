import { inject } from "@/infra/di/inject";
import { Injector } from "@/infra/di/injector";
import { ObsidianApp } from "@/obsidian/obsidian.tokens";
import { Modal } from "obsidian";
import { createApp, type App, type Component } from "vue";
import { VueAppInjector } from "../vue.tokens";
import { Option } from "@/infra/data-structures/option";

export class VueModal<TIn extends object, TOut> extends Modal {
  #vueApp: App | undefined;

  #injector = inject(Injector);

  #resolvers: PromiseWithResolvers<Option<TOut>>[] = [];

  #title: string;
  #component: Component;
  #componentProps: TIn | null = null;
  #customWidth?: number;

  constructor(title: string, component: Component, customWidth?: number) {
    super(inject(ObsidianApp));

    this.#title = title;
    this.#component = component;
    this.#customWidth = customWidth;
  }

  openModal(input: TIn): Promise<Option<TOut>> {
    this.#componentProps = input;
    this.#resolvers.push(Promise.withResolvers());
    this.open();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return Option.fromPromise(this.#resolvers.at(-1)!.promise);
  }

  onOpen(): void {
    this.titleEl.setText(this.#title);
    if (this.#customWidth) {
      this.modalEl.setCssProps({
        "--dialog-width": `${this.#customWidth}px`,
      });
    }

    this.#vueApp = createApp(this.#component, {
      onClose: () => {
        this.close();
      },
      onAction: (out: TOut) => {
        this.#resolvers.at(-1)?.resolve(Option.some(out));
        this.close();
      },
      ...this.#componentProps,
    });
    this.#vueApp.provide(VueAppInjector, this.#injector);
    this.#vueApp.mount(this.contentEl);
  }

  onClose(): void {
    this.#resolvers.pop()?.resolve(Option.none());
    this.#vueApp?.unmount();
    this.contentEl.empty();
  }
}
