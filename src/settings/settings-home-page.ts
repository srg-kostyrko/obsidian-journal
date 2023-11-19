import { Setting } from "obsidian";
import { EventEmitter } from "eventemitter3";
import { JournalConfig } from "../config/journal-config";
import { Disposable } from "../contracts/disposable.types";

export class SettingsHomePage extends EventEmitter implements Disposable {
  constructor(
    private containerEl: HTMLElement,
    private config: JournalConfig,
  ) {
    super();
  }

  display(): void {
    const { containerEl } = this;

    new Setting(containerEl).setName("Journals").setHeading();

    for (const [entry, index] of this.config) {
      const setting = new Setting(containerEl).setName(entry.name).addButton((button) => {
        button
          .setIcon("pencil")
          .setTooltip(`Edit ${entry.name}`)
          .setClass("clickable-icon")
          .onClick(() => {
            this.emit("navigate", {
              type: "journal",
              index,
            });
          });
      });
      if (entry.isDefault) {
        const defaultBadge = setting.nameEl.createEl("span");
        defaultBadge.innerText = "Default";
        defaultBadge.classList.add("flair");
      } else {
        setting.addButton((button) => {
          button.setIcon("trash-2").setTooltip(`Delete ${entry.name}`).setClass("clickable-icon");
        });
      }
    }
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
