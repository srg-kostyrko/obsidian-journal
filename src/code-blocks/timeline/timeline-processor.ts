import { type App, MarkdownRenderChild } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import TimelineCodeBlock from "./TimelineCodeBlock.vue";
import type { JournalPlugin } from "@/types/plugin.types";
import { APP_KEY, PLUGIN_KEY } from "@/constants";

export class TimelineCodeBlockProcessor extends MarkdownRenderChild {
  private _vueApp: VueApp | undefined;
  private mode: string | undefined;

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
    const lines = this.source.split("\n");
    for (const line of lines) {
      const [key, value] = line.split(":");
      if (key.trim() === "mode") {
        this.mode = value.trim();
      }
    }
    this._vueApp = createApp(TimelineCodeBlock, {
      mode: this.mode,
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
