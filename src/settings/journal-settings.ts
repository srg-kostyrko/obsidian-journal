import { PluginSettingTab, Setting, Plugin, App } from "obsidian";
import { JournalConfig } from "../config/journal-config";

export class JournalSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private config: JournalConfig,
  ) {
    super(app, plugin);
  }
  display() {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Setting #1").addText((text) => {
      text.setPlaceholder("Enter a string");
    });
  }
}
