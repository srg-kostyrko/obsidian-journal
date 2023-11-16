import EventEmitter from "eventemitter3";
import { Disposable } from "../contracts/disposable.types";
import { CalendarConfig } from "../contracts/config.types";
import { Setting } from "obsidian";

export class SettingsCalendarPage extends EventEmitter implements Disposable {
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
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
