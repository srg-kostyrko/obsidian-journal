import { PluginSettingTab } from "obsidian";

import JournalSettingsRoot from "./JournalSettingsRoot.vue";
import { Injectable } from "@/infra/di/decorators/Injectable";
import { JournalSettingsTab as JournalSettingsTabToken } from "./settings.tokens";
import { JournalPlugin, ObsidianApp } from "@/obsidian/obsidian.tokens";
import { inject } from "@/infra/di/inject";
import { VueApp } from "@/infra/ui-framework/vue.tokens";

export
@Injectable(JournalSettingsTabToken)
class JournalSettingTab extends PluginSettingTab {
  #vueApp = inject(VueApp, JournalSettingsRoot, this.containerEl);

  constructor() {
    super(inject(ObsidianApp), inject(JournalPlugin));
  }

  display() {
    this.#vueApp.mount();
  }

  hide() {
    this.#vueApp.unmount();
  }
}
