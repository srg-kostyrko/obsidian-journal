import { MarkdownRenderChild } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import NavigationCodeBlock from "./NavigationCodeBlock.vue";

export class NavCodeBlockProcessor extends MarkdownRenderChild {
  private _vueApp: VueApp | undefined;
  private mode: string | undefined;

  constructor(
    containerElement: HTMLElement,
    private source: string,
    private path: string,
  ) {
    super(containerElement);
    this.init();
  }

  init(): void {
    this._vueApp = createApp(NavigationCodeBlock, {
      path: this.path,
    });
    this._vueApp.mount(this.containerEl);
  }

  onunload(): void {
    this._vueApp?.unmount();
    this._vueApp = undefined;
    this.containerEl.empty();
  }
}
