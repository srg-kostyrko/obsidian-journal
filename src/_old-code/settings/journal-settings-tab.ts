import { type App, PluginSettingTab } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import JournalSettingsRoot from "./JournalSettingsRoot.vue";
import { PLUGIN_KEY } from "@/constants";
import type { JournalPlugin } from "@/types/plugin.types";

export class JournalSettingTab extends PluginSettingTab {
  #vueApp: VueApp | null = null;
  #plugin: JournalPlugin;

  constructor(app: App, plugin: JournalPlugin) {
    super(app, plugin);
    this.#plugin = plugin;
  }

  display() {
    this.#vueApp = createApp(JournalSettingsRoot);
    this.#vueApp.provide(PLUGIN_KEY, this.#plugin);
    this.#vueApp.mount(this.containerEl);
  }

  hide() {
    this.#vueApp?.unmount();
    this.#vueApp = null;
    this.containerEl.empty();
  }
}
