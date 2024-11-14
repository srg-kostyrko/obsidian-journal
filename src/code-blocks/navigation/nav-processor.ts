import { type App, MarkdownRenderChild } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import NavigationCodeBlock from "./NavigationCodeBlock.vue";
import type { JournalPlugin } from "@/types/plugin.types";
import { APP_KEY, PLUGIN_KEY } from "@/constants";

export class NavCodeBlockProcessor extends MarkdownRenderChild {
  private _vueApp: VueApp | undefined;

  constructor(
    app: App,
    plugin: JournalPlugin,
    containerElement: HTMLElement,
    private source: string,
    private path: string,
  ) {
    super(containerElement);
    this.init(app, plugin);
  }

  init(app: App, plugin: JournalPlugin): void {
    this._vueApp = createApp(NavigationCodeBlock, {
      path: this.path,
    });
    this._vueApp.provide(APP_KEY, app);
    this._vueApp.provide(PLUGIN_KEY, plugin);
    this._vueApp.mount(this.containerEl);
  }

  onunload(): void {
    this._vueApp?.unmount();
    this._vueApp = undefined;
    this.containerEl.empty();
  }
}
