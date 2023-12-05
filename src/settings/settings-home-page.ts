import { App, Setting, moment } from "obsidian";
import { CreateJournalModal } from "./ui/create-journal-modal";
import { JournalManager } from "../journal-manager";
import { SettingsWidget } from "./settings-widget";
import { JournalConfigManager } from "../config/journal-config-manager";
import { DeleteJournalModal } from "../ui/delete-journal-modal";

export class SettingsHomePage extends SettingsWidget {
  constructor(
    app: App,
    private manager: JournalManager,
    private containerEl: HTMLElement,
    private config: JournalConfigManager,
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
      if (this.config.defaultId === entry.id) {
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
            button
              .setIcon("trash-2")
              .setTooltip(`Delete ${entry.name}`)
              .setClass("clickable-icon")
              .onClick(async () => {
                new DeleteJournalModal(this.app, this.manager, entry).open();
              });
          });
      }
    }

    new Setting(containerEl).setName("Calendar Settings").setHeading();

    new Setting(containerEl).setName("First Day of Week").addDropdown((dropdown) => {
      const fow = moment().localeData().firstDayOfWeek();
      const fowText = moment().localeData().weekdays()[fow];
      dropdown
        .addOptions({
          "-1": `From Locale (${fowText})`,
          "0": "Sunday",
          "1": "Monday",
          "2": "Tuesday",
          "3": "Wednesday",
          "4": "Thursday",
          "5": "Friday",
          "6": "Saturday",
        })
        .setValue(String(this.config.calendar.firstDayOfWeek))
        .onChange((value) => {
          this.config.calendar.firstDayOfWeek = parseInt(value, 10);
          this.manager.calendar.updateLocale();
          this.save(true);
        });
    });
    if (this.config.calendar.firstDayOfWeek !== -1) {
      const s = new Setting(containerEl).setName("First Week of Year");
      s.setDesc(`First week of year must contain ${this.config.calendar.firstWeekOfYear ?? 1} January`);
      s.addText((text) => {
        text.setValue(String(this.config.calendar.firstWeekOfYear ?? 1)).onChange((value) => {
          if (value) {
            this.config.calendar.firstWeekOfYear = parseInt(value, 10);
            this.manager.calendar.updateLocale();
            s.setDesc(`First week of year must contain ${this.config.calendar.firstWeekOfYear ?? 1} January`);
            this.save();
          }
        });
      });
    }
  }
}
