import { Modal } from "obsidian";
import { type Component, createApp, type App as VueApp } from "vue";
import { app$, plugin$ } from "../../stores/obsidian.store";

export class VueModal extends Modal {
  private _vueApp: VueApp | undefined;
  constructor(
    private title: string,
    private component: Component,
    private componentProps: Record<string, unknown> = {},
  ) {
    super(app$.value);
    plugin$.value.register(() => {
      this.close();
    });
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this._vueApp = createApp(this.component, {
      ...this.componentProps,
      onClose: () => {
        this.close();
      },
    });
    this._vueApp.mount(this.contentEl);
  }

  onClose(): void {
    this._vueApp?.unmount();
    this.contentEl.empty();
  }
}
