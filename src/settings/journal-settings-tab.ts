import { PluginSettingTab } from "obsidian";
import { createApp, type App as VueApp } from "vue";
import JournalSettingsRoot from "./JournalSettingsRoot.vue";

export class JournalSettingTab extends PluginSettingTab {
  #vueApp: VueApp | null = null;
  display() {
    this.#vueApp = createApp(JournalSettingsRoot);
    this.#vueApp.mount(this.containerEl);
  }

  hide() {
    this.#vueApp?.unmount();
    this.#vueApp = null;
    this.containerEl.empty();
  }
}
