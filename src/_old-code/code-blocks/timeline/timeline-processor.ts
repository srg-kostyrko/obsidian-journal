import { MarkdownRenderChild } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import TimelineCodeBlock from "./TimelineCodeBlock.vue";
import type { JournalPlugin } from "@/types/plugin.types";
import { PLUGIN_KEY } from "@/constants";

export class TimelineCodeBlockProcessor extends MarkdownRenderChild {
  private _vueApp: VueApp | undefined;
  private mode: string | undefined;

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
    const lines = this.source.split("\n");
    for (const line of lines) {
      const [key, value] = line.split(":");
      if (key?.trim() === "mode") {
        this.mode = value?.trim() ?? "week";
      }
    }
    this._vueApp = createApp(TimelineCodeBlock, {
      mode: this.mode,
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
