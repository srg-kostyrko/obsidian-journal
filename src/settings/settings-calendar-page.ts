import { CalendarConfig, CalendarGranularity, CalendarSection } from "../contracts/config.types";
import { App, Setting } from "obsidian";
import { FolderSuggestion } from "./ui/folder-suggestion";
import { SettingsWidget } from "./settings-widget";
import { capitalize } from "../utils";
import { SECTIONS_MAP } from "../constants";

export class SettingsCalendarPage extends SettingsWidget {
  constructor(
    app: App,
    private containerEl: HTMLElement,
    private config: CalendarConfig,
    private isDefault: boolean,
  ) {
    super(app);
  }

  get headingText(): string {
    return `Configuring ${this.config.name}`;
  }

  display(): void {
    const { containerEl } = this;

    const heading = new Setting(containerEl)
      .setName(this.headingText)
      .setHeading()
      .addButton((button) => {
        button
          .setClass("journal-clickable")
          .setIcon("chevron-left")
          .setTooltip("Back to list")
          .onClick(() => {
            this.navigate({ type: "home" });
          });
      });

    const badge = heading.nameEl.createEl("span");
    badge.innerText = `ID: ${this.config.id}`;
    badge.classList.add("flair");

    new Setting(containerEl).setName("Journal name").addText((text) => {
      text.setValue(this.config.name).onChange(() => {
        this.config.name = text.getValue();
        heading.setName(this.headingText);
        this.save();
      });
    });

    new Setting(containerEl)
      .setName("Root folder")
      .setDesc("All other folders in sections will be relative to this one")
      .addText((text) => {
        new FolderSuggestion(this.app, text.inputEl);
        text
          .setValue(this.config.rootFolder)
          .setPlaceholder("Example: folder 1/folder 2")
          .onChange(() => {
            this.config.rootFolder = text.getValue();
            this.save();
          });
      });
    if (this.isDefault) {
      const startUp = new Setting(containerEl)
        .setName("Open on startup")
        .setDesc("Open a note whenever you open this vault? This option is only avaliable for default journal")
        .addToggle((toggle) => {
          toggle.setValue(this.config.openOnStartup).onChange(() => {
            this.config.openOnStartup = toggle.getValue();
            this.save(true);
          });
        });
      if (this.config.openOnStartup) {
        startUp.addDropdown((dropdown) => {
          const avaliable: CalendarGranularity[] = [];
          if (this.config.day.enabled) {
            dropdown.addOption("day", "Daily note");
            avaliable.push("day");
          }
          if (this.config.week.enabled) {
            dropdown.addOption("week", "Weekly note");
            avaliable.push("week");
          }
          if (this.config.month.enabled) {
            dropdown.addOption("month", "Monthly note");
            avaliable.push("month");
          }
          if (this.config.quarter.enabled) {
            dropdown.addOption("quarter", "Quarterly note");
            avaliable.push("quarter");
          }
          if (this.config.year.enabled) {
            dropdown.addOption("year", "Yearly note");
            avaliable.push("year");
          }
          if (!avaliable.contains(this.config.startupSection)) {
            this.config.startupSection = avaliable[0];
          }
          dropdown.setValue(this.config.startupSection).onChange((value) => {
            this.config.startupSection = value as CalendarConfig["startupSection"];
            this.save();
          });
        });
      }
    }

    this.renderSectionsHeading("day", this.config.day);
    this.renderSectionsHeading("week", this.config.week);
    this.renderSectionsHeading("month", this.config.month);
    this.renderSectionsHeading("quarter", this.config.quarter);
    this.renderSectionsHeading("year", this.config.year);
  }

  renderSectionsHeading(sectionName: CalendarGranularity, config: CalendarSection): void {
    const setting = new Setting(this.containerEl).setName(`${capitalize(SECTIONS_MAP[sectionName])} notes`);
    if (config.enabled) {
      setting.addButton((button) => {
        button
          .setIcon("cog")
          .setClass("journal-clickable")
          .setTooltip(`Configure ${SECTIONS_MAP[sectionName]} notes`)
          .onClick(() => {
            this.navigate({
              type: "journal",
              id: this.config.id,
              section: sectionName,
            });
          });
      });
    }
    setting.addToggle((toggle) => {
      toggle.setValue(config.enabled).onChange((value) => {
        config.enabled = value;
        this.save(true);
      });
    });
  }
}
