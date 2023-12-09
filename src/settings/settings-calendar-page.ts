import { CalendarConfig, CalendarSection, SectionName } from "../contracts/config.types";
import { App, Setting } from "obsidian";
import { FolderSuggestion } from "./ui/folder-suggestion";
import { SettingsWidget } from "./settings-widget";
import { capitalize } from "../utils";

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
          const avaliable: SectionName[] = [];
          if (this.config.daily.enabled) {
            dropdown.addOption("daily", "Daily note");
            avaliable.push("daily");
          }
          if (this.config.weekly.enabled) {
            dropdown.addOption("weekly", "Weekly note");
            avaliable.push("weekly");
          }
          if (this.config.monthly.enabled) {
            dropdown.addOption("monthly", "Monthly note");
            avaliable.push("monthly");
          }
          if (this.config.quarterly.enabled) {
            dropdown.addOption("quarterly", "Quarterly note");
            avaliable.push("quarterly");
          }
          if (this.config.yearly.enabled) {
            dropdown.addOption("yearly", "Yearly note");
            avaliable.push("yearly");
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

    this.renderSectionsHeading("daily", this.config.daily);
    this.renderSectionsHeading("weekly", this.config.weekly);
    this.renderSectionsHeading("monthly", this.config.monthly);
    this.renderSectionsHeading("quarterly", this.config.quarterly);
    this.renderSectionsHeading("yearly", this.config.yearly);
  }

  renderSectionsHeading(sectionName: SectionName, config: CalendarSection): void {
    const daily = new Setting(this.containerEl).setName(`${capitalize(sectionName)} notes`);
    if (config.enabled) {
      daily.addButton((button) => {
        button
          .setIcon("cog")
          .setClass("journal-clickable")
          .setTooltip(`Configure ${sectionName} notes`)
          .onClick(() => {
            this.navigate({
              type: "journal",
              id: this.config.id,
              section: sectionName,
            });
          });
      });
    }
    daily.addToggle((toggle) => {
      toggle.setValue(config.enabled).onChange((value) => {
        config.enabled = value;
        this.save(true);
      });
    });
  }
}
