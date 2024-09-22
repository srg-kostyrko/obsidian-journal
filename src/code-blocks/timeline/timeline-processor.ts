import { MarkdownRenderChild } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import TimelineCodeBlock from "./TimelineCodeBlock.vue";

export class TimelineCodeBlockProcessor extends MarkdownRenderChild {
  private _vueApp: VueApp | undefined;
  private mode: string | undefined;

  constructor(
    containerEl: HTMLElement,
    private source: string,
    private path: string,
  ) {
    super(containerEl);
    this.init();
  }

  init(): void {
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
    this._vueApp.mount(this.containerEl);
  }

  onunload(): void {
    this._vueApp?.unmount();
    this._vueApp = undefined;
    this.containerEl.empty();
  }
}
