import { App, Setting } from "obsidian";
import { JournalConfig } from "../config/journal-config";
import { CreateJournalModal } from "./ui/create-journal-modal";
import { JournalManager } from "../journal-manager";
import { SettingsWidget } from "./settings-widget";

export class SettingsHomePage extends SettingsWidget {
  constructor(
    app: App,
    private manager: JournalManager,
    private containerEl: HTMLElement,
    private config: JournalConfig,
  ) {
    super(app);
  }

  display(): void {
    const { containerEl } = this;

    new Setting(containerEl)
      .setName("Journals")
      .setHeading()
      .addButton((button) => {
        button
          .setTooltip("Create new journal configuration")
          .setCta()
          .setIcon("plus")
          .onClick(() => {
            new CreateJournalModal(this.app, this.manager).open();
          });
      });

    for (const entry of this.config) {
      const setting = new Setting(containerEl)
        .setName(entry.name)
        .setDesc(`ID: ${entry.id}`)
        .addButton((button) => {
          button
            .setIcon("pencil")
            .setTooltip(`Edit ${entry.name}`)
            .setClass("clickable-icon")
            .onClick(() => {
              this.navigate({
                type: "journal",
                id: entry.id,
              });
            });
        });
      if (entry.isDefault) {
        const defaultBadge = setting.nameEl.createEl("span");
        defaultBadge.innerText = "Default";
        defaultBadge.classList.add("flair");
        defaultBadge.classList.add("mod-pop");
      } else {
        setting
          .addButton((button) => {
            button
              .setIcon("shield-check")
              .setTooltip(`Make default`)
              .setClass("clickable-icon")
              .onClick(async () => {
                await this.manager.changeDefaultJournal(entry.id);
                this.save(true);
              });
          })
          .addButton((button) => {
            button.setIcon("trash-2").setTooltip(`Delete ${entry.name}`).setClass("clickable-icon");
          });
      }
    }
  }
}
