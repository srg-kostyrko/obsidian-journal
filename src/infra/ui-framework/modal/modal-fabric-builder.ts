import { inject } from "@/infra/di/inject";
import { JournalPlugin } from "@/obsidian/obsidian.tokens";
import { VueModal } from "./vue-modal";
import type { Component } from "vue";

export class ModalFabricBuilder<TIn extends object, TOut extends object> {
  #title: string;
  #component: Component;

  constructor(title: string, component: Component) {
    this.#title = title;
    this.#component = component;
  }

  #customWidth?: number;

  withCustomWidth(customWidth: number) {
    this.#customWidth = customWidth;
    return this;
  }

  factory() {
    return () => {
      const plugin = inject(JournalPlugin);
      const modal = new VueModal<TIn, TOut>(this.#title, this.#component, this.#customWidth);
      plugin.register(() => modal.close());
      return modal;
    };
  }
}
