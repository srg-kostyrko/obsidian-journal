import { MarkdownRenderChild } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import NavigationCodeBlock from "./NavigationCodeBlock.vue";
import type { JournalPlugin } from "@/types/plugin.types";
import { PLUGIN_KEY } from "@/constants";

export class NavCodeBlockProcessor extends MarkdownRenderChild {
  private _vueApp: VueApp | undefined;

  constructor(
    plugin: JournalPlugin,
    containerElement: HTMLElement,
    private source: string,
    private path: string,
  ) {
    super(containerElement);
    this.init(plugin);
  }

  init(plugin: JournalPlugin): void {
    this._vueApp = createApp(NavigationCodeBlock, {
      path: this.path,
    });
    this._vueApp.provide(PLUGIN_KEY, plugin);
    this._vueApp.mount(this.containerEl);
  }

  onunload(): void {
    this._vueApp?.unmount();
    this._vueApp = undefined;
    this.containerEl.empty();
  }
}
