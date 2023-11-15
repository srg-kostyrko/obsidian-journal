import { PluginSettingTab, Setting } from "obsidian";

export class JournalSettingTab extends PluginSettingTab {
  display() {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Setting #1").addText((text) => {
      text.setPlaceholder("Enter a string");
    });
  }
}
