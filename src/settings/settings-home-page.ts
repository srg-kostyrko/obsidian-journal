import { App, Setting } from "obsidian";
import { EventEmitter } from "eventemitter3";
import { JournalConfig } from "../config/journal-config";
import { Disposable } from "../contracts/disposable.types";
import { CreateJournalModal } from "./ui/create-journal-modal";
import { JournalManager } from "../journal-manager";

export class SettingsHomePage extends EventEmitter implements Disposable {
  constructor(
    private app: App,
    private manager: JournalManager,
    private containerEl: HTMLElement,
    private config: JournalConfig,
  ) {
    super();
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
            new CreateJournalModal(this.app, this.manager, this).open();
          });
      });

    for (const entry of this.config) {
      const setting = new Setting(containerEl).setName(entry.name).addButton((button) => {
        button
          .setIcon("pencil")
          .setTooltip(`Edit ${entry.name}`)
          .setClass("clickable-icon")
          .onClick(() => {
            this.emit("navigate", {
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
