import { MarkdownRenderChild, type MarkdownPostProcessorContext, parseYaml } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import HomeCodeBlock from "./HomeCodeBlock.vue";
import type { JournalPlugin } from "@/types/plugin.types";
import { PLUGIN_KEY } from "@/constants";
import type { HomeCodeBlockConfig } from "./home-code-block.types";
import type { JournalSettings } from "@/types/settings.types";

export class HomeCodeBlockProcessor extends MarkdownRenderChild {
  private _vueApp: VueApp | undefined;

  constructor(
    plugin: JournalPlugin,
    containerElement: HTMLElement,
    private source: string,
    private context: MarkdownPostProcessorContext,
  ) {
    super(containerElement);
    this.init(plugin);
  }

  init(plugin: JournalPlugin): void {
    const config = this.#prepareConfig();
    this._vueApp = createApp(HomeCodeBlock, {
      path: this.context.sourcePath,
      config,
    });
    this._vueApp.provide(PLUGIN_KEY, plugin);
    this._vueApp.mount(this.containerEl);
  }

  #prepareConfig(): HomeCodeBlockConfig {
    try {
      const config: HomeCodeBlockConfig = this.source
        ? parseYaml(this.source.replaceAll("\t", "  "))
        : {
            show: ["day"],
          };

      return {
        show: config.show.filter((type: string): type is JournalSettings["write"]["type"] =>
          ["day", "week", "month", "quarter", "year", "custom"].includes(type),
        ),
        separator: config.separator || " • ",
        scale: config.scale || 1,
      };
    } catch (error) {
      console.error(error);
      return {
        show: ["day"],
        separator: " • ",
        scale: 1,
      };
    }
  }

  onunload(): void {
    this._vueApp?.unmount();
    this._vueApp = undefined;
    this.containerEl.empty();
  }
}
