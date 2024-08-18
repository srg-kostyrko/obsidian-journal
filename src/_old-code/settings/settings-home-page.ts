import { type App, Setting, moment } from "obsidian";
import { CreateJournalModal } from "./ui/create-journal-modal";
import { JournalManager } from "../journal-manager";
import { SettingsWidget } from "./settings-widget";
import { JournalConfigManager } from "../config/journal-config-manager";
import { DeleteJournalModal } from "../ui/delete-journal-modal";
import { AddNotesJournalModal } from "../ui/add-notes-journal-modal";

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
      .setName("Start week on")
      .setDesc("Which day to consider as first day of week.")
      .addDropdown((dropdown) => {
        const fow = moment().localeData().firstDayOfWeek();
        const fowText = moment().localeData().weekdays()[fow];
        dropdown
          .addOption("-1", `Locale default (${fowText})`)
          .addOptions({
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
      const s = new Setting(containerEl).setName("First week of year");
      s.setDesc(`Define what date in January a week should contain to be considered first week of a year.`);
      s.addText((text) => {
        text.setValue(String(this.config.calendar.firstWeekOfYear ?? 1)).onChange((value) => {
          if (value) {
            this.config.calendar.firstWeekOfYear = parseInt(value, 10);
            this.manager.calendar.updateLocale();
            this.save();
          }
        });
      });
    }

    new Setting(containerEl)
      .setName("Journals")
      .setHeading()
      .addButton((button) => {
        button
          .setTooltip("Create new journal configuration")
          .setCta()
          .setClass("journal-clickable")
          .setIcon("plus")
          .onClick(() => {
            new CreateJournalModal(this.app, this.manager).open();
          });
      });

    if (this.config.size === 0) {
      containerEl.createEl("p", { text: "No journals configured yet." });
    }

    for (const entry of this.config) {
      const row = new Setting(containerEl).setName(entry.name).setDesc(`ID: ${entry.id}`);

      const badge = row.nameEl.createEl("span");
      badge.innerText = `${entry.type}`;
      badge.classList.add("flair");

      if (entry.type === "calendar") {
        row.addButton((button) => {
          button
            .setIcon("import")
            .setTooltip("Add existing notes to journal")
            .setClass("clickable-icon")
            .setClass("journal-clickable")
            .onClick(() => {
              new AddNotesJournalModal(this.app, this.manager, entry).open();
            });
        });
      }

      row.addButton((button) => {
        button
          .setIcon("pencil")
          .setTooltip(`Edit ${entry.name}`)
          .setClass("clickable-icon")
          .setClass("journal-clickable")
          .onClick(() => {
            this.navigate({
              type: "journal",
              id: entry.id,
            });
          });
      });

      row.addButton((button) => {
        button
          .setIcon("trash-2")
          .setTooltip(`Delete ${entry.name}`)
          .setClass("clickable-icon")
          .setClass("journal-clickable")
          .onClick(async () => {
            new DeleteJournalModal(this.app, this.manager, entry).open();
          });
      });
    }

    new Setting(containerEl).setName("Calendar view").setHeading();
    new Setting(containerEl).setName("Add to").addDropdown((dropdown) => {
      dropdown
        .addOptions({
          left: "Left sidebar",
          right: "Right sidebar",
        })
        .setValue(this.config.calendarView.leaf || "right")
        .onChange((value) => {
          this.config.calendarView.leaf = value as "left" | "right";
          this.save();
          this.manager.placeCalendarView(true);
        });
    });
    new Setting(containerEl).setName("Show weeks").addDropdown((dropdown) => {
      dropdown
        .addOptions({
          none: "Don't show",
          left: "Before weekdays",
          right: "After weekdays",
        })
        .setValue(this.config.calendarView.weeks || "left")
        .onChange((value) => {
          this.config.calendarView.weeks = value as "left" | "right";
          this.save();
        });
    });
  }
}
