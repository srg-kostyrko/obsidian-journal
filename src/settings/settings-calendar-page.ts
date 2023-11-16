import EventEmitter from "eventemitter3";
import { Disposable } from "../contracts/disposable.types";
import { CalendarConfig, CalndarSectionBase } from "../contracts/config.types";
import { Setting } from "obsidian";
import { SettingsBaseCalendarSection } from "./settings-base-calendar-section";
import { SettingsCalendarWeeklySection } from "./settings-calendar-weekly-section";

export class SettingsCalendarPage extends EventEmitter implements Disposable {
  private disposables: Disposable[] = [];

  constructor(
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
      text
        .setValue(this.config.rootFolder)
        .setPlaceholder("Example: folder 1/folder 2")
        .onChange(() => {
          this.config.rootFolder = text.getValue();
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

    this.registerSection(new SettingsBaseCalendarSection(containerEl, this.config.daily, "Daily"));
    this.registerSection(new SettingsCalendarWeeklySection(containerEl, this.config.weekly, "Weekly"));
    this.registerSection(new SettingsBaseCalendarSection(containerEl, this.config.monthly, "Monthly"));
    this.registerSection(new SettingsBaseCalendarSection(containerEl, this.config.quarterly, "Quarterly"));
    this.registerSection(new SettingsBaseCalendarSection(containerEl, this.config.yearly, "Yearly"));
  }

  registerSection(section: SettingsBaseCalendarSection<CalndarSectionBase>): void {
    this.disposables.push(section);
    section.on("save", () => this.emit("save"));
    section.on("save+redraw", () => this.emit("save+redraw"));
    section.display();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.removeAllListeners();
  }
}
