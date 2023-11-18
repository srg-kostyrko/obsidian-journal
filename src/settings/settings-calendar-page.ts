import EventEmitter from "eventemitter3";
import { Disposable } from "../contracts/disposable.types";
import { CalendarConfig, CalndarSectionBase } from "../contracts/config.types";
import { App, Setting } from "obsidian";
import { SettingsBaseCalendarSection } from "./settings-base-calendar-section";
import { SettingsCalendarWeeklySection } from "./settings-calendar-weekly-section";
import { FolderSuggestion } from "./ui/folder-suggestion";

export class SettingsCalendarPage extends EventEmitter implements Disposable {
  private sections: SettingsBaseCalendarSection<CalndarSectionBase>[] = [];

  constructor(
    private app: App,
    private containerEl: HTMLElement,
    private config: CalendarConfig,
  ) {
    super();
  }

  get headerText(): string {
    return `Configuring ${this.config.name}`;
  }

  display(): void {
    const { containerEl } = this;

    const heading = new Setting(containerEl)
      .setName(this.headerText)
      .setHeading()
      .addButton((button) => {
        button.setButtonText("Back to list").onClick(() => {
          this.emit("navigate", { type: "home" });
        });
      });

    new Setting(containerEl).setName("Journal Name").addText((text) => {
      text.setValue(this.config.name).onChange(() => {
        this.config.name = text.getValue();
        heading.setName(this.headerText);
        this.emit("save");
      });
    });

    new Setting(containerEl).setName("Root Folder").addText((text) => {
      new FolderSuggestion(this.app, text.inputEl);
      text
        .setValue(this.config.rootFolder)
        .setPlaceholder("Example: folder 1/folder 2")
        .onChange(() => {
          this.config.rootFolder = text.getValue();
          this.updateFolderSuggestions();
          this.emit("save");
        });
    });

    const startUp = new Setting(containerEl).setName("Open on Startup").addToggle((toggle) => {
      toggle.setValue(this.config.openOnStartup).onChange(() => {
        this.config.openOnStartup = toggle.getValue();
        this.emit("save+redraw");
      });
    });
    if (this.config.openOnStartup) {
      startUp.addDropdown((dropdown) => {
        dropdown.addOptions({
          daily: "Daily Note",
          weekly: "Weekly Note",
          monthly: "Monthly Note",
          quarterly: "Quarterly Note",
          yearly: "Yearly Note",
        });
      });
    }

    this.registerSection(
      new SettingsBaseCalendarSection(this.app, this.config, containerEl, this.config.daily, "Daily"),
    );
    this.registerSection(
      new SettingsCalendarWeeklySection(this.app, this.config, containerEl, this.config.weekly, "Weekly"),
    );
    this.registerSection(
      new SettingsBaseCalendarSection(this.app, this.config, containerEl, this.config.monthly, "Monthly"),
    );
    this.registerSection(
      new SettingsBaseCalendarSection(this.app, this.config, containerEl, this.config.quarterly, "Quarterly"),
    );
    this.registerSection(
      new SettingsBaseCalendarSection(this.app, this.config, containerEl, this.config.yearly, "Yearly"),
    );
  }

  registerSection(section: SettingsBaseCalendarSection<CalndarSectionBase>): void {
    this.sections.push(section);
    section.on("save", () => this.emit("save"));
    section.on("save+redraw", () => this.emit("save+redraw"));
    section.display();
  }

  private updateFolderSuggestions() {
    for (const section of this.sections) {
      section.updateFolderSuggestions(this.config.rootFolder);
    }
  }

  dispose(): void {
    for (const disposable of this.sections) {
      disposable.dispose();
    }
    this.removeAllListeners();
  }
}
